import DaeWriter, {NS} from "../gl/dae/DaeWriter.js";
import { downloadXml, hex } from "../../../Util.js";
import { createElement, E } from "../../../lib/Element.js";
import BlockRenderer from "./BlockRenderer.js";
import RenderBatch from "../gl/gx/RenderBatch.js";
import RenderStreamParser from "../../../game/model/RenderStreamParser.js";
import BitStreamReader from "../../../game/BitStreamReader.js";
import { MAP_CELL_SIZE } from "../../../game/Game.js";
const GL = WebGL2RenderingContext;

/* this seems to work (though XMLNS shit is awful) except...
guess what, blender DAE importer doesn't support most primitive
types because lmfao

we would have to triangulate everything we export then...
that part may not be too hard but I'm not sure how the result
will be, if vertices will be actually connected or not.

either way we probably need to un-triangulate everything on
import because even if blender is able to generate files that
aren't just triangles (unlikely), probably most models that
exist are triangulated...

obviously we can just leave them triangulated but it's very
inefficient which might actually matter here.

oh but guess what, blender also doesn't support importing or
exporting anything with multiple textures because of course.
so all of this is useless! yay

so I guess the only way to make this shit actually work is
to write a goddamn plugin for Blender to read/write the
model/texture files directly
*/

export default class MapExporter {
    /** Exports map to 3D model file. */

    constructor(game, gx, map) {
        this.game = game;
        this.gx   = gx;
        this.map  = map;
    }

    export() {
        this.writer = new DaeWriter();

        for(let iBlock=0; iBlock < this.map.blocks.length; iBlock++) {
            const block = this.map.blocks[iBlock];
            if(!block || (block.mod >= 0xFF) || !block.load()) continue;
            this._addBlockTextures(block);
            this._blockToGeometry(block);
        }

        //XXX prettyXml() doesn't work with DAE?
        downloadXml(this.writer.toXml(), 'map.dae',
            'model/vnd.collada+xml', false);
    }

    _makeBuffers(block) {
        //create the buffers
        //name them the same as the 'semantic' value
        //for simplicity
        const buffers = {
            POSITION: {
                attr: 'POS',
                data: block.vtxPositions,
                count: block.header.nVtxs * 3,
                //idx * sizeof(s16)
                //this is per value in the buffer so we
                //don't need to worry about X/Y/Z
                read: (view,idx) => view.getInt16(idx*2) / 8,
                params: [ //the names don't actually matter according to the spec
                    //but they do need to be unique, I assume
                    {name:'X', type:'float'},
                    {name:'Y', type:'float'},
                    {name:'Z', type:'float'},
                ],
            },

            COLOR: {
                attr: ['COL0', 'COL1'],
                data: block.vtxColors,
                count: block.header.nColors,
                read: (view,idx) => {
                    const c = view.getUint16(idx*2);
                    return [
                        ( (c >> 12)        / 15.0) * 255,
                        (((c >>  8) & 0xF) / 15.0) * 255,
                        (((c >>  4) & 0xF) / 15.0) * 255,
                        (( c        & 0xF) / 15.0) * 255,
                    ];
                },
                params: [ //XXX verify name and type
                    {name:'R', type:'int'},
                    {name:'G', type:'int'},
                    {name:'B', type:'int'},
                    {name:'A', type:'int'},
                ],
            },

            TEXCOORD: {
                attr: ['TEX0', 'TEX1', 'TEX2', 'TEX3',
                    'TEX4', 'TEX5', 'TEX6', 'TEX7'],
                data: block.texCoords,
                count: block.header.nTexCoords*2,
                read: (view,idx) => view.getInt16(idx*2) / 8192,
                params: [
                    {name:'U', type:'float'},
                    {name:'V', type:'float'},
                ],
            },
        };
        //using the Array types here doesn't work because
        //it uses the host's byte order. so we need to
        //manually build the array.
        for(const [name, buf] of Object.entries(buffers)) {
            const view = new DataView(buf.data);
            const values = [];
            for(let i=0; i<buf.count; i++) {
                let val = buf.read(view, i);
                if(!Array.isArray(val)) val = [val];
                for(let v of val) values.push(v);
            }
            buf.elem = this.writer.addBuffer(name,
                values, block.header.nVtxs, block.header.name,
                buf.params);
        }
        return buffers;
    }

    _blockToGeometry(block) {
        const gl = this.gx.gl;
        const id = block.header.name;
        console.assert(id != undefined);

        const buffers = this._makeBuffers(block);

        //create the block's transformation matrix
        const tx  = block.x * MAP_CELL_SIZE;
        const ty  = block.header.yOffset;
        const tz  = block.z * MAP_CELL_SIZE;
        let   mtx = mat4.create();
        mat4.translate(mtx, mtx, vec3.fromValues(tx, ty, tz));
        mat4.transpose(mtx, mtx);

        //create the vertices array
        const mats  = [];
        for(let i=0; i<block.shaders.length; i++) {
            mats.push(`shader${i}`);
        }
        const eMesh = this.writer.addGeometry(
            id, buffers, mtx, mats);

        //parse the block
        const streams = ['main', 'reflective', 'water'];
        for(const name of streams) {
            const stream = new RenderStreamParser(this.gx);
            const reader = new BitStreamReader(
                block.renderInstrs[name]);
            let shaderIdx = null;
            stream.execute(block, reader, {
                isMap: true,
                shaderHandler: (sh, sid, tex) => { shaderIdx=sid },
                vtxHandler: (mode, ...vtxs) => {
                    this._addVtxs(eMesh, id, buffers,
                        mode, shaderIdx, ...vtxs);
                },
            });
        }
    }

    _triangulate(mode, ...vtxs) {
        //lol blender doesn't support any actual primitives
        //for DAE importing
        const result = [];

        switch(mode) {
            case GL.TRIANGLES:
                return vtxs;
            case GL.TRIANGLE_FAN: {
                for(let i=2; i<vtxs.length; i++) {
                    result.push(vtxs[0]);
                    result.push(vtxs[i-1]);
                    result.push(vtxs[i]);
                }
                return result;
            }
            case GL.TRIANGLE_STRIP: {
                for(let i=2; i<vtxs.length; i++) {
                    result.push(vtxs[i-2]);
                    result.push(vtxs[i-1]);
                    result.push(vtxs[i]);
                }
                return result;
            }
            case GL.LINES: //XXX
            case GL.LINE_STRIP:
            default:
                console.error("Unsupported primitive type", mode);
                throw new Error("Unsupported primitive type");
        }
    }

    _addVtxs(eMesh, id, buffers, mode, shaderIdx, ...vtxs) {
        const tris  = this._triangulate(mode, ...vtxs);
        if(tris.length == 0) return;

        const count = tris.length / 3;
        const attrs = {count: count};
        if(shaderIdx != null) {
            attrs.material = `shader${shaderIdx}.material`;
        }
        const eOp = createElement([NS.dae, 'triangles'], attrs);

        //build the index buffers
        const idxNames = [];
        let offset = 0;
        for(const [name, buf] of Object.entries(buffers)) {
            let sName = name;
            if(sName == 'POSITION') sName = 'VERTEX'; //lol
            let aNames = buf.attr;
            if(!Array.isArray(aNames)) aNames = [aNames];
            for(let item of aNames) {
                //ignore attrs we don't have
                if(tris[0][item+'_idx'] != null) {
                    eOp.append(createElement([NS.dae, 'input'], {
                        semantic: sName,
                        source: `#${id}.${name}`,
                        offset: offset++,
                    }));
                }
            }
            idxNames.push(name);
        }

        //populate the index buffers
        const idxs = [];
        for(const tri of tris) {
            for(const attr of idxNames) {
                const buf = buffers[attr];
                let aNames = buf.attr;
                if(!Array.isArray(aNames)) aNames = [aNames];
                for(const aName of aNames) {
                    const val = tri[aName+'_idx'];
                    if(val != null) idxs.push(val);
                }
            }
        }

        //the actual index list
        eOp.append(createElement([NS.dae, 'p'], null, idxs.join(' ')));
        eMesh.append(eOp);
    }

    _addBlockTextures(block) {
        /** Add the block's texture graphics to the DAE.
         *  @param {MapBlock} block The block to add.
         */
        let iShader=0;
        for(const shader of block.shaders) {
            const images = [];
            for(const layer of shader.layer) {
                const tex = block.textures[layer.texture];
                let id = tex.gameTexture.id;
                if(id < 0) id = -id;
                id &= 0x7FFF;
                images.push(`texture${hex(id,4)}`)
            }
            this.writer.addEffect(`shader${iShader}`, images);
            iShader++;
        }
        for(const tex of block.textures) {
            //the ID is weird because of how the game transforms
            //it to force it to be a TEX1 index.
            let id = tex.gameTexture.id;
            if(id < 0) id = -id;
            id &= 0x7FFF;
            this.writer.addImage(`texture${hex(id,4)}`,
                `./TEX${tex.gameTexture.tblIdx}/${hex(id,4)}.00.png`);
        }
    }
}
