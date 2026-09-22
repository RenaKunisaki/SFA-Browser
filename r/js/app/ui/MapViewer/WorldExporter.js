import { MAP_CELL_SIZE } from "../../../game/Game.js";
import { download, hex } from "../../../Util.js";
import RenderStreamParser from "../../../game/model/RenderStreamParser.js";
import BitStreamReader from "../../../game/BitStreamReader.js";
import GlbWriter, { ComponentType, Target } from "../gl/gltf/GlbWriter.js";
import { TaskCancelled } from "../TaskProgress.js";
const GL = WebGL2RenderingContext;

//shader flags that affect the material (see RenderStreamParser)
const FLAG_CULL_BACKFACE = 1 <<  3;
const FLAG_LAVA          = 1 <<  7;
const FLAG_ALPHA_COMPARE = 1 << 10;
const FLAG_BLEND_29      = 1 << 29;
const FLAG_FORCE_BLEND   = 1 << 30;
const STREAMS = ['main', 'reflective', 'water'];

/** Exports every map block on one global map grid layer to a
 *  single glTF binary (.glb) file, laid out in world coordinates.
 */
export default class WorldExporter {
    constructor(game, gx, layerNo) {
        this.game    = game;
        this.gx      = gx;
        this.layerNo = layerNo;
    }

    async export() {
        const progress = this.game.app.progress;
        const cells    = this._getCells(this.game.mapGrid[this.layerNo]);
        this.writer    = new GlbWriter();
        this.writer.useExtension('KHR_materials_unlit');
        this._mapNodes  = new Map(); //Map => node index
        this._blocks    = new Map(); //Block => {mesh, yOffset} or null
        this._materials = {}; //key => material index
        this._textures  = {}; //key => texture index
        this._nTris     = 0;

        progress.show({
            taskText: `Exporting Layer ${this.layerNo}`,
            subText:  "",
            numSteps: cells.length, stepsDone: 0,
        });
        try {
            let curDir = null;
            for(let i=0; i<cells.length; i++) {
                const cell = cells[i];
                await progress.update({
                    subText: `${cell.map.name}: mod${cell.block.mod}.${cell.block.sub}`,
                    stepsDone: i,
                });
                //the texture cache is keyed by ID only, so clear it per map dir
                if(cell.map.dirName != curDir) {
                    this.game.unloadTextures();
                    curDir = cell.map.dirName;
                }
                await this._addCell(cell);
            }
        }
        catch(ex) {
            if(ex instanceof TaskCancelled) return;
            throw ex;
        }
        finally {
            this.game.unloadTextures();
            progress.hide();
        }

        console.log(`Exported layer ${this.layerNo}: ${this._nTris} triangles, `+
            `${this.writer.json.meshes.length} meshes, `+
            `${this.writer.json.images.length} textures`);
        download(this.writer.toBlob(), `map_layer${this.layerNo}.glb`,
            'model/gltf-binary');
    }

    /** Get all grid cells on the layer that have a block. */
    _getCells(layer) {
        const cells = [];
        for(const col of Object.values(layer)) {
            for(const cell of Object.values(col)) {
                if(cell.block && cell.block.mod < 0xFF) cells.push(cell);
            }
        }
        cells.sort((a, b) => a.map.id - b.map.id); //group by map
        return cells;
    }

    /** Add the block at this cell to the scene. */
    async _addCell(cell) {
        const block = cell.block;
        let info = this._blocks.get(block);
        if(info === undefined) {
            info = await this._loadBlock(block);
            this._blocks.set(block, info);
        }
        if(!info) return; //failed to load, or no geometry
        this.writer.addNode({
            name: `mod${block.mod}.${block.sub} @${cell.worldX},${cell.worldZ}`,
            mesh: info.mesh,
            translation: [cell.worldX * MAP_CELL_SIZE, info.yOffset,
                cell.worldZ * MAP_CELL_SIZE],
        }, this._getMapNode(cell.map));
    }

    /** Load a block, build its mesh, and unload it again. */
    async _loadBlock(block) {
        const keep = block.header != null; //already loaded by the viewer
        if(!block.load(this.gx) || !block.header) return null;
        const mesh = await this._buildMesh(block);
        const info = (mesh == null) ? null : {mesh:mesh, yOffset:block.header.yOffset};
        if(!keep) block.unload();
        return info;
    }

    _getMapNode(map) {
        let idx = this._mapNodes.get(map);
        if(idx == undefined) {
            idx = this.writer.addNode({name:`${hex(map.id,2)} ${map.name}`});
            this._mapNodes.set(map, idx);
        }
        return idx;
    }

    /** Build a glTF mesh from the block's render streams.
     *  @returns {number} The mesh index, or null if the block has no geometry.
     */
    async _buildMesh(block) {
        const vtxIdx = new Map(); //vertex key => index
        const pos = [], col = [], uv = [];
        const prims = new Map(); //material key => primitive
        const addVtx = v => {
            const p = v.POS, c = v.COL0 || [255,255,255,255], t = v.TEX0 || [0,0];
            const key = `${p[0]},${p[1]},${p[2]}|${c[0]},${c[1]},${c[2]},${c[3]}|${t[0]},${t[1]}`;
            let idx = vtxIdx.get(key);
            if(idx == undefined) {
                idx = vtxIdx.size;
                vtxIdx.set(key, idx);
                pos.push(p[0], p[1], p[2]);
                col.push(c[0], c[1], c[2], c[3]);
                uv .push(t[0], t[1]);
            }
            return idx;
        };

        for(const name of STREAMS) {
            let prim = this._getPrim(prims, block, null);
            try {
                new RenderStreamParser(this.gx).execute(block,
                    new BitStreamReader(block.renderInstrs[name]), {
                        isMap: true,
                        shaderHandler: sh => { prim = this._getPrim(prims, block, sh) },
                        vtxHandler: (mode, ...vtxs) =>
                            this._addTris(prim, mode, vtxs.map(addVtx)),
                    });
            }
            catch(ex) {
                console.error("Error parsing block", block, name, ex);
            }
        }
        if(pos.length == 0) return null;

        const min = [ Infinity,  Infinity,  Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for(let i=0; i<pos.length; i++) {
            min[i%3] = Math.min(min[i%3], pos[i]);
            max[i%3] = Math.max(max[i%3], pos[i]);
        }
        const W = this.writer;
        const attributes = {
            POSITION:   W.addAccessor(new Float32Array(pos), ComponentType.FLOAT,
                'VEC3', Target.ARRAY_BUFFER, {min:min, max:max}),
            COLOR_0:    W.addAccessor(new Uint8Array(col), ComponentType.UNSIGNED_BYTE,
                'VEC4', Target.ARRAY_BUFFER, {normalized:true}),
            TEXCOORD_0: W.addAccessor(new Float32Array(uv), ComponentType.FLOAT,
                'VEC2', Target.ARRAY_BUFFER),
        };
        const primitives = [];
        const nVtxs = pos.length / 3;
        for(const prim of prims.values()) {
            if(prim.idxs.length == 0) continue;
            this._nTris += prim.idxs.length / 3;
            const idxs = (nVtxs > 0xFFFF) ?
                new Uint32Array(prim.idxs) : new Uint16Array(prim.idxs);
            primitives.push({
                attributes: attributes,
                indices:    W.addAccessor(idxs, (nVtxs > 0xFFFF) ?
                    ComponentType.UNSIGNED_INT : ComponentType.UNSIGNED_SHORT,
                    'SCALAR', Target.ELEMENT_ARRAY_BUFFER),
                material:   await this._getMaterial(prim),
                mode:       4, //TRIANGLES
            });
        }
        if(primitives.length == 0) return null;
        return W.addMesh(`${block.map.dirName}/mod${block.mod}.${block.sub}`,
            primitives);
    }

    /** Triangulate a draw op into the primitive's index list.
     *  The game's front faces are clockwise; glTF wants counter-clockwise.
     */
    _addTris(prim, mode, v) {
        const tri = (a, b, c) => prim.idxs.push(a, c, b);
        switch(mode) {
            case GL.TRIANGLES:
                for(let i=0; i+2<v.length; i+=3) tri(v[i], v[i+1], v[i+2]);
                break;
            case GL.TRIANGLE_STRIP:
                for(let i=2; i<v.length; i++) {
                    if(i & 1) tri(v[i-1], v[i-2], v[i]);
                    else tri(v[i-2], v[i-1], v[i]);
                }
                break;
            case GL.TRIANGLE_FAN:
                for(let i=2; i<v.length; i++) tri(v[0], v[i-1], v[i]);
                break;
            default: break; //lines and points aren't exported
        }
    }

    /** Get the primitive that geometry using this shader belongs to. */
    _getPrim(prims, block, shader) {
        const flags  = shader ? shader.flags : 0;
        const layers = []; //the fragment shader only uses two texture slots
        for(let i=0; shader && i<Math.min(shader.nLayers, 2); i++) {
            const tex = block.textures[shader.layer[i].texture];
            if(!tex || !tex.gameTexture) break; //missing texture placeholder
            layers.push(tex.gameTexture);
        }
        //mirror the alpha handling in RenderStreamParser._handleShaderFlags
        let alpha = 'OPAQUE';
        if(flags & (FLAG_FORCE_BLEND | FLAG_BLEND_29)) alpha = 'BLEND';
        else if((flags & FLAG_ALPHA_COMPARE) && !(flags & FLAG_LAVA)) alpha = 'MASK';
        const cull   = (flags & FLAG_CULL_BACKFACE) != 0;
        const texKey = layers.length ?
            layers.map(tex => this._texKey(block, tex)).join('+') : 'untextured';
        const key    = `${texKey}|${alpha}${cull ? '' : '|2side'}`;
        let prim = prims.get(key);
        if(!prim) {
            prim = {key:key, texKey:texKey, layers:layers,
                alpha:alpha, cull:cull, idxs:[]};
            prims.set(key, prim);
        }
        return prim;
    }

    /** Copy a texture image to a canvas of the same size.
     *  @note Image.canvas is not used because it's never resized
     *   from the default 300x150.
     */
    _imageToCanvas(image) {
        const canvas = document.createElement('canvas');
        canvas.width  = image.width;
        canvas.height = image.height;
        canvas.getContext('2d').putImageData(image.data, 0, 0);
        return canvas;
    }

    /** Composite two texture layers the way the game's fragment shader does.
     *  @returns {HTMLCanvasElement} The combined image.
     */
    _bakeLayers(t0, t1) {
        const w = Math.max(t0.width, t1.width);
        const h = Math.max(t0.height, t1.height);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const out = ctx.createImageData(w, h);
        const d0 = t0.image.data.data, d1 = t1.image.data.data;
        for(let y=0; y<h; y++) {
            for(let x=0; x<w; x++) {
                //nearest-neighbour sample each layer, since sizes can differ
                const i0 = ((Math.floor(y*t0.height/h) * t0.width) + Math.floor(x*t0.width/w)) * 4;
                const i1 = ((Math.floor(y*t1.height/h) * t1.width) + Math.floor(x*t1.width/w)) * 4;
                const o  = ((y*w) + x) * 4;
                const t  = (1 - (d0[i0+3]/255)) * (d1[i1+3]/255); //mix(tex0, tex1, t)
                for(let c=0; c<4; c++) out.data[o+c] = (d0[i0+c] * (1-t)) + (d1[i1+c] * t);
            }
        }
        ctx.putImageData(out, 0, 0);
        return canvas;
    }

    /** Get a key that uniquely identifies a texture across all maps. */
    _texKey(block, tex) {
        let id = (tex.id < 0) ? -tex.id : tex.id;
        id &= 0x7FFF;
        const dir = (tex.tblIdx == 2) ? '' : block.map.dirName; //TEXPRE is global
        return `${dir}/TEX${tex.tblIdx}/${hex(id,4)}`;
    }

    async _getMaterial(prim) {
        let idx = this._materials[prim.key];
        if(idx != undefined) return idx;
        const material = {
            name: prim.key,
            pbrMetallicRoughness: {metallicFactor:0, roughnessFactor:1},
            alphaMode:  prim.alpha,
            doubleSided: !prim.cull,
            extensions: {KHR_materials_unlit:{}},
        };
        if(prim.alpha == 'MASK') material.alphaCutoff = 1/255; //game uses alpha > 0
        if(prim.layers.length) {
            const tex = await this._getTexture(prim);
            if(tex != null) {
                material.pbrMetallicRoughness.baseColorTexture = {index:tex, texCoord:0};
            }
        }
        idx = this.writer.addMaterial(material);
        this._materials[prim.key] = idx;
        return idx;
    }

    async _getTexture(prim) {
        let idx = this._textures[prim.texKey];
        if(idx != undefined) return idx;
        const canvas = (prim.layers.length == 1) ?
            this._imageToCanvas(prim.layers[0].image) :
            this._bakeLayers(prim.layers[0], prim.layers[1]);
        const png = await this._encodePng(canvas);
        if(!png) return null;
        idx = this.writer.addTexture(this.writer.addImage(png, prim.texKey));
        this._textures[prim.texKey] = idx;
        return idx;
    }

    /** Encode a canvas as PNG.
     *  @returns {ArrayBuffer} The PNG data, or null on failure.
     */
    _encodePng(canvas) {
        return new Promise(resolve => {
            canvas.toBlob(blob => resolve(blob ? blob.arrayBuffer() : null),
                'image/png');
        });
    }
}
