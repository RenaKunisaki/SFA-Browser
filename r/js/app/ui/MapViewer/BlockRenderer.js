import BitStreamReader from '../../../game/BitStreamReader.js';
import { Reg as CPReg } from '../gl/gx/CP.js';
import DlistParser from '../gl/gx/DlistParser.js';
import RenderBatch from '../gl/gx/RenderBatch.js';
import GX from '../gl/gx/GX.js';
import { MAP_CELL_SIZE } from '../../../game/Game.js';
import Box from '../gl/Model/Box.js';
import Block from '../../../game/map/Block.js';
import RenderStreamParser from '../../../game/model/RenderStreamParser.js'

//struct types
let HitsBinEntry, SurfaceType;

const SurfaceTypeColors = {
    generic:     [0x20, 0x20, 0x20],
    grass:       [0x00, 0xC0, 0x00],
    sand:        [0x80, 0x80, 0x40],
    snow:        [0xF0, 0xF0, 0xF0],
    death:       [0xF0, 0x00, 0x00],
    icePlatform: [0x00, 0xC0, 0xC0],
    ice:         [0x40, 0xC0, 0xC0],
    water:       [0x40, 0x80, 0xC0],
    gold:        [0xC0, 0xC0, 0x40],
    roughStone:  [0x40, 0x40, 0x40],
    magicCave:   [0xC0, 0x40, 0xC0],
    wood:        [0xC0, 0xC0, 0x80],
    stone:       [0x60, 0x60, 0x60],
    lava:        [0xC0, 0x00, 0x00],
    iceWall:     [0x00, 0xA0, 0xA0],
    conveyor:    [0x60, 0x20, 0x60],
    metal:       [0xC0, 0xC0, 0xC0],
};

/** Renders map blocks. */
export default class BlockRenderer {
    constructor(mapViewer, gx) {
        this.mapViewer = mapViewer;
        this.game = mapViewer.game;
        HitsBinEntry = this.game.app.types.getType('sfa.maps.HitsBinEntry');
        SurfaceType  = this.game.app.types.getType('sfa.maps.SurfaceType');
        this.gx = gx;
        this.gl = gx.gl;
        this.stream = new RenderStreamParser(gx);
        this.dlistParser = new DlistParser(gx);
        this.reset();
    }

    reset() {
        this.pickerIds = {}; //id => list
        this._batches  = {};
    }

    _getBatch(name, block, params) {
        const key = [name, block.x, block.z, params.isPicker ? 1 :0].join(',');
        let batch = this._batches[key];
        if(!batch) {
            batch = new RenderBatch(this.gx);
            this._batches[key] = batch;
        }
        return batch;
    }

    /** Parse the display lists.
     *  @param {Block} block The block to render.
     *  @param {string} whichStream One of 'main', 'water', 'reflective'
     *   specifying which bitstream to use.
     *  @param {object} params Render parameters.
     *  @returns {RenderBatch} Parsed render batch.
     */
   parse(block, whichStream, params={}) {
        if(!block.load(this.gx)) return null;

        const gx = this.gx;
        const gl = this.gx.gl;

        //check if we already parsed this
        const key = ([
            whichStream, block.x, block.z,
            params.isGrass ? 1 : 0,
            params.showHidden ? 1 : 0,
            params.isPicker ? 1 : 0,
            params.dlist,
        ]).join(',');
        if(this._batches[key]) return this._batches[key];

        params = Object.assign({}, params); //shallow copy
        params.isMap = true;

        //console.log("parsing", block, whichStream);
        this.curBatch = new RenderBatch(this.gx);
        this._batches[key] = this.curBatch;
        this._isDrawingForPicker = params.isPicker;
        this.curShaderIdx = null;
        this.curBlock     = block;
        this.curStream    = whichStream;
        this.params       = params;

        const ops = new BitStreamReader(block.renderInstrs[whichStream]);
        this._batches[key] = this.stream.execute(
            block, ops, params);
        return this._batches[key];
    }

    /** Set the ModelView matrix to position at a block.
     *  @param {MapBlock} block Block to position at.
     *  @param {boolean} yOffset Whether to include the block's Y offset.
     */
    setMtxForBlock(block, yOffset=true) {
        if(!block) return;
        let mv = mat4.clone(this.gx.context.matModelView);
        const map = this.mapViewer.map;
        const offsX = (block.x-map.originX)*MAP_CELL_SIZE;
        const offsY = yOffset ? block.header.yOffset : 0;
        const offsZ = (block.z-map.originZ)*MAP_CELL_SIZE;
        mat4.translate(mv, mv, vec3.fromValues(offsX, offsY, offsZ));
        this.gx.setModelViewMtx(mv);
    }

    /** Render the block.
     *  @param {Block} block The block to render.
     *  @param {string} whichStream One of 'main', 'water', 'reflective'
     *   specifying which bitstream to use.
     *  @param {object} params Render parameters.
     *  @returns {RenderBatch} The render batch.
     */
    render(block, whichStream, params={}) {
        this.curShaderIdx = null;
        this.curBlock     = block;
        this.curStream    = whichStream;
        this.params       = params;
        const batch       = this.parse(block, whichStream, params);
        if(batch) {
            this.gx.executeBatch(batch);
            //this.gx.gl.flush();
        }
        return batch;
    }

    /** Render the block's hit-lines from HITS.bin. */
    renderHits(block, params) {
        if(!block.hits) return null;

        const batch = this._getBatch('hits', block, params);
        if(!batch.isEmpty) return batch; //already set up

        const gx = this.gx;
        const gl = this.gx.gl;
        const map = this.mapViewer.map;
        const offsX = (block.x-map.originX)*MAP_CELL_SIZE;
        const offsY = 0; //block.header.yOffset;
        const offsZ = (block.z-map.originZ)*MAP_CELL_SIZE;

        if(params.isPicker) batch.addFunction(() => {
            this.gx.setShaderParams(
                GX.CullMode.NONE,
                GX.BlendMode.NONE, GX.BlendFactor.SRCALPHA,
                GX.BlendFactor.INVSRCALPHA, GX.LogicOp.NOOP,
                true, GX.Compare.LEQUAL, true, //depth test+update enabled
                true); //alpha test enabled
            //blend off, face culling off
            gx.disableTextures(GX.BlendMode.NONE, false);
        });
        else batch.addFunction(() => {
            //blend on, face culling off
            gx.disableTextures(GX.BlendMode.BLEND, false);
        });

        //slightly less efficient but oh well, less repetition
        batch.addFunction(() => {
            let mv = mat4.clone(gx.context.matModelView);
            mat4.translate(mv, mv, vec3.fromValues(offsX, offsY, offsZ));
            gx.setModelViewMtx(mv);
            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(-20, 20);
        })

        let vtxs = [gl.TRIANGLES];
        for(let i=0; i<block.hits.length; i++) {
            const hit = block.hits[i];
            let id = -1;
            if(params.isPicker) {
                id = gx.addPickerObj({
                    type:   'blockHit',
                    idx:    i,
                    offset: block.hitsOffset + (i * HitsBinEntry.size),
                    block:  block,
                    hit:    hit,
                });
            }
            const v = hit.toVtxs(gx, id);
            v.shift(); //remove TRIANGLES
            vtxs = vtxs.concat(v);
        }

        batch.addVertices(...vtxs);
        batch.addFunction(() => { gl.disable(gl.POLYGON_OFFSET_FILL) });
        return batch;
    }

    /** Render the block's collision mesh. */
    renderCollisionMesh(block, params) {
        const gx = this.gx;
        const gl = this.gx.gl;
        const batch = this._getBatch('collision', block, params);
        if(!batch.isEmpty) return batch; //already set up

        batch.addFunction(() => { this.setMtxForBlock(block) });

        const vtxs = [gl.TRIANGLES];
        for(let iPoly=0; iPoly < block.polygons.length; iPoly++) {
            const poly = block.polygons[iPoly];
            const positions = new DataView(block.vtxPositions);
            const flags = poly.group ? poly.group.flags : 0;
            const type  = SurfaceType.valueToString(
                poly.group ? poly.group.type : -1);
            const typeColor = SurfaceTypeColors[type];
            const color = typeColor ?
                [typeColor[0], typeColor[1], typeColor[2], 0xA0] :
                [0xFF, 0x00, 0xFF, 0xA0];
            let id = -1;
            if(params.isPicker) {
                id = gx.addPickerObj({
                    type:   'collisionMesh',
                    idx:    iPoly,
                    block:  block,
                    poly:   poly,
                });
            }
            for(let i=0; i<3; i++) {
                let pIdx = poly.vtxs[i] * 6;
                //division by 8 is hardcoded, not derived from POSSHFT
                vtxs.push({
                    POS: [
                        positions.getInt16(pIdx)   / 8,
                        positions.getInt16(pIdx+2) / 8,
                        positions.getInt16(pIdx+4) / 8,
                    ],
                    COL0: color, COL1: color, id: id,
                });
            }
        }
        batch.addVertices(...vtxs);
        return batch;
    }

    /** Render the block's polygon group bounding boxes. */
    renderPolyGroups(block, params) {
        const gx = this.gx;
        const gl = this.gx.gl;
        const batch = this._getBatch('polygroups', block, params);
        if(!batch.isEmpty) return batch; //already set up

        batch.addFunction(() => { this.setMtxForBlock(block) });
        const batches = [];

        for(let iGroup=0; iGroup < block.polyGroups.length; iGroup++) {
            const group = block.polyGroups[iGroup];
            /*const color = [
                (group.flags >> 28) & 0xFF,
                (group.flags >> 20) & 0xFF,
                (group.flags >> 12) & 0xFF,
                0x40];*/
            const type      = SurfaceType.valueToString(group.type);
            const typeColor = SurfaceTypeColors[type];
            const color     = typeColor ?
                [typeColor[0], typeColor[1], typeColor[2], 0x80] :
                [0xFF, 0x00, 0xFF, 0x80];
            let id = -1;
            if(params.isPicker) {
                id = gx.addPickerObj({
                    type:   'polyGroup',
                    idx:    iGroup,
                    block:  block,
                    group:  group,
                });
            }
            const box = new Box(this.gx,
                [group.x1, group.y1, group.z1],
                [group.x2, group.y2, group.z2],
                ).setColors(color).setId(id);
            batches.push(box.batch);
        }
        batch.addBatches(...batches);
        return batch;
    }

    _setInitialGxParams(whichStream) {
        //set default vtx formats for rendering block geometry
        this.gx.cp.setReg(CPReg.ARRAY_STRIDE_VTXS,  6); //sizeof(vec3s)
        this.gx.cp.setReg(CPReg.ARRAY_STRIDE_COLOR, 2); //sizeof(u16)
        for(let i=0; i<8; i++) {
            this.gx.cp.setReg(CPReg.ARRAY_STRIDE_TEXCOORD+i, 4); //sizeof(vec2s)
            this.gx.cp.setVatFormat(i, vatDefaults[i]);
        }

        //set initial render modes (XXX verify)
        if(this._isDrawingForPicker) {
            this.curBatch.addFunction(() => {this.gx.setShaderParams(
                DefaultCull, //cull backfaces
                GX.BlendMode.NONE, GX.BlendFactor.SRCALPHA,
                GX.BlendFactor.INVSRCALPHA, GX.LogicOp.NOOP,
                true, GX.Compare.LEQUAL, true, //depth test+update enabled
                true); //alpha test enabled
                this.gx.setAlphaCompare(GX.Compare.GREATER, 0,
                    GX.AlphaOp.AND, GX.Compare.GREATER, 0);
            });
        }
        else if(whichStream == 'reflective') {
            this.curBatch.addFunction(() => {this.gx.setShaderParams(
                DefaultCull, //cull backfaces
                GX.BlendMode.NONE, GX.BlendFactor.SRCALPHA,
                GX.BlendFactor.INVSRCALPHA, GX.LogicOp.NOOP,
                true, GX.Compare.LEQUAL, true, //depth test+update enabled
                true); //alpha test enabled
                this.gx.setAlphaCompare(GX.Compare.ALWAYS, 0,
                    GX.AlphaOp.AND, GX.Compare.ALWAYS, 0);
            });
        }
        else this.curBatch.addFunction(() => {this.gx.setShaderParams(
            DefaultCull, //cull backfaces
            GX.BlendMode.BLEND, GX.BlendFactor.SRCALPHA,
            GX.BlendFactor.INVSRCALPHA, GX.LogicOp.NOOP,
            true, GX.Compare.LEQUAL, true, //depth test+update enabled
            true); //alpha test enabled
            this.gx.setAlphaCompare(GX.Compare.GREATER, 0,
                GX.AlphaOp.AND, GX.Compare.GREATER, 0);
        });
    }

    _handleShaderFlags() {
        const gx    = this.gx;
        const gl    = this.gx.gl;
        const flags = this.curShader.flags;

        let blendMode         = GX.BlendMode.NONE;
        let sFactor           = GX.BlendFactor.ONE;
        let dFactor           = GX.BlendFactor.ZERO;
        let logicOp           = GX.LogicOp.NOOP;
        let compareEnable     = true;
        let compareFunc       = GX.Compare.LEQUAL;
        let updateEnable      = true;
        let zCompLoc          = 1; //before tex
        let alphaCompareA0    = 0;
        let alphaCompareA1    = 0;
        let alphaCompareOP0   = GX.Compare.GREATER;
        let alphaCompareOP1   = GX.Compare.GREATER;
        let alphaCompareLogic = GX.AlphaOp.AND;

        let chan0_enable     = true;
        let chan0_amb_src    = GX.ColorSrc.REG;
        let chan0_mat_src    = GX.ColorSrc.VTX;
        let chan0_light_mask = GX.LightID.NULL;
        let chan0_diff_fn    = GX.DiffuseFn.NONE;
        let chan0_attn_fn    = GX.AttnFn.NONE;

        if(flags & ShaderFlags.Fog == 0) {
            //gx.setFog(0, 0, 0, 0, 0, fogColor2);
        }
        else {
            //_gxSetDefaultFog
            //gx.setFog(fogStartZ,fogEndZ,fogNearZ,fogFarZ,4,fogColor);
        }
        if(!(flags & ShaderFlags.Water | ShaderFlags.StreamingVideo)) {
            if(flags & ShaderFlags.Lava == 0) {
                //shaderFn_8005f1e0(shader, 0x80)
            }
            //else shaderFn_8004da54(shader);
        }
        if(((flags & ShaderFlags.ReflectSkyscape) == 0)
        /*|| (pSkyTexture == NULL)*/) {
            if ((flags & ShaderFlags.Caustic) == 0) {
                //if(isHeavyFogEnabled()) {
                    //renderHeavyFog(getFogColor());
                //}
            }
            else {
                //drawWaterSurface();
            }
        }
        else {
            //drawSkyReflection(pSkyTexture,skyMtx);
        }


        if(((flags & ShaderFlags.ForceBlend) == 0)
        && ((flags & 0x20000000) == 0)) {
            if (((flags & ShaderFlags.AlphaCompare) == 0)
            || ((flags & ShaderFlags.Lava) != 0)) {
                //GXSetAlphaCompare(7,0,0,7,0);
                alphaCompareOP0   = GX.Compare.ALWAYS;
                alphaCompareA0    = 0;
                alphaCompareLogic = GX.AlphaOp.AND;
                alphaCompareOP1   = GX.Compare.ALWAYS;
                alphaCompareA1    = 0;
            }
            else {
                zCompLoc        = 0; //after tex
                //GXSetAlphaCompare(4,0,0,4,0);
                alphaCompareOP0   = GX.Compare.GREATER;
                alphaCompareA0    = 0;
                alphaCompareLogic = GX.AlphaOp.AND;
                alphaCompareOP1   = GX.Compare.GREATER;
                alphaCompareA1    = 0;
            }
        }
        else {
            //GXSetAlphaCompare(7,0,0,7,0);
            alphaCompareOP0   = GX.Compare.ALWAYS;
            alphaCompareA0    = 0;
            alphaCompareLogic = GX.AlphaOp.AND;
            alphaCompareOP1   = GX.Compare.ALWAYS;
            alphaCompareA1    = 0;
            blendMode    = GX.BlendMode.BLEND;
            sFactor      = GX.BlendFactor.SRCALPHA;
            dFactor      = GX.BlendFactor.INVSRCALPHA;
            updateEnable = false;
        }

        if(!(flags & (ShaderFlags.IndoorOutdoorBlend | 1 | 0x800 | 0x1000))) {
            //objGetColor(0,&local_18.r,&local_18.g,&local_18.b);
            //GXSetChanCtrl(0,1,0,1,0,0,2);
            //gx.setChanCtrl... all default params
            //local_28 = local_18;
            //gx.setChanAmbColor(Channel0_RGB,&local_28);
        }
        else {
            //gx.setChanAmbColor(Channel0_RGB,color_803db63c);
            chan0_enable     = (flags & ShaderFlags.IndoorOutdoorBlend) ? false : true;
            chan0_amb_src    = GX.ColorSrc.REG;
            chan0_mat_src    = GX.ColorSrc.VTX;
            chan0_light_mask = GX.LightID.NULL;
            chan0_diff_fn    = GX.DiffuseFn.NONE;
            chan0_attn_fn    = GX.AttnFn.NONE;
        }
        //chan0 stuff relates to lighting, not worried about it right now...

        const cull = flags & ShaderFlags.CullBackface ?
            GX.CullMode.BACK : GX.CullMode.NONE;

        //condense these into one function for hopefully better speed
        if(!this._isDrawingForPicker) {
            this.curBatch.addFunction(() => {
                this.gx.setShaderParams(cull, blendMode, sFactor, dFactor,
                    logicOp, compareEnable, compareFunc, updateEnable,
                    alphaCompareOP0 != GX.Compare.ALWAYS);
                    //this seems unnecessary. we should be able to
                    //just leave the alpha compare enabled.
                gx.setAlphaCompare(alphaCompareOP0, alphaCompareA0,
                    alphaCompareLogic, alphaCompareOP1, alphaCompareA1);
            });
        }
    }

    _makeSetTextureCmd(params) {
        const gl = this.gl;
        return () => {
            for(let [slot, tex] of params) {
                //console.log("using texture", slot, tex);
                gl.activeTexture(gl.TEXTURE0 + slot);
                tex.bind();
                gl.uniform1i(this.gx.programInfo.uniforms.uSampler[slot], slot);
            }
        };
    }

    /** Select a texture and shader.
     *  This can affect how later commands are interpreted.
     */
    _renderOpTexture() {
        const gx  = this.gx;
        const gl  = this.gx.gl;
        const ops = this.curOps;
        const idx = ops.read(6);
        if(this.params.isGrass) return;
        if(this.curShaderIdx == idx) return;

        this.curShader = this.curBlock.shaders[idx];
        this.curShaderIdx = idx;
        if(LogRenderOps) {
            console.log("Select texture %d", idx, this.curShader);
            //console.log("Select texture %d: shader flags=%s", idx,
            //    this.curShader.attrFlags);
        }

        if(this._isDrawingForPicker) {
            this.curBatch.addFunction(() => {this.gx.setShaderParams(
                DefaultCull, //cull backfaces
                GX.BlendMode.NONE, //blend mode
                GX.BlendFactor.ONE, //sFactor
                GX.BlendFactor.ZERO, //dFactor
                GX.LogicOp.NOOP, //logicOp
                true, //compareEnable
                GX.CompareMode.LEQUAL, //compareFunc
                true, //updateEnable
                true, //alphaTest
            )});
        }
        else if(this.curShader) {
            this._handleShaderFlags();
        }
        else if(this.curStream == 'water'
        || this.curStream == 'reflective') { //XXX verify these
            this.curBatch.addFunction(() => {this.gx.setShaderParams(
                DefaultCull, //cull backfaces
                GX.BlendMode.BLEND, //blend mode
                GX.BlendFactor.SRCALPHA, //sFactor
                GX.BlendFactor.INVSRCALPHA, //dFactor
                GX.LogicOp.NOOP, //logicOp
                true, //compareEnable
                GX.Compare.LEQUAL, //compareFunc
                false, //updateEnable
                true, //alphaTest
            )});
            gx.setAlphaCompare(GX.Compare.GREATER, 0,
                GX.AlphaOp.AND, GX.Compare.GREATER, 0);
        }
        else {
            this.curBatch.addFunction(() => {
                this.gx.setShaderParams(
                    DefaultCull, //cull backfaces
                    GX.BlendMode.NONE, //blend mode
                    GX.BlendFactor.ONE, //sFactor
                    GX.BlendFactor.ZERO, //dFactor
                    GX.LogicOp.NOOP, //logicOp
                    true, //compareEnable
                    GX.Compare.LEQUAL, //compareFunc
                    true, //updateEnable
                    true, //alphaTest
                );
                //XXX this must be a flag on the texture or something
                gx.setAlphaCompare(GX.Compare.GREATER, 0,
                    GX.AlphaOp.AND, GX.Compare.GREATER, 0);
            });
        }

        if(!this._isDrawingForPicker) { //select the textures
            const nLayers = this.curShader ? this.curShader.nLayers : 0;
            const params  = []; //batch these ops
            for(let i=0; i<gx.MAX_TEXTURES; i++) {
                let tex = gx.blankTexture;
                if(i < nLayers) {
                    const idx = this.curShader.layer[i].texture;
                    //console.log("select texture", idx, this.textures[idx]);
                    if(idx >= 0 && this.curBlock.textures[idx]) {
                        tex = this.curBlock.textures[idx];
                    }
                }
                params.push([i, tex]);
            }
            if(params.length > 0) {
                this.curBatch.addFunction(this._makeSetTextureCmd(params));
            }
        }
    }

    /** Call one of the block's display lists.
     */
    _renderOpCallList() {
        const ops = this.curOps;
        const idx = ops.read(8);
        if(this.curBlock.dlists[idx] == undefined) {
            throw new Error(`Calling list ${idx} but max is ${this.curBlock.dlists.length}`);
        }

        if(this.params.isGrass) {
            if(this.curShader
            && (this.curShader.flags & ShaderFlags.TranspRelated2000)) return;
        }
        if(!this.params.showHidden) {
            //don't render hidden polys
            if(this.curShader
            && (this.curShader.flags & ShaderFlags.Hidden)) return;
        }

        const dlistData = {
            POS:  this.curBlock.vtxPositions,
            //NRM:  this.curBlock.vtxNormals, //map blocks don't have normals
            COL0: this.curBlock.vtxColors,
            TEX0: this.curBlock.texCoords,
            TEX1: this.curBlock.texCoords,
            TEX2: this.curBlock.texCoords,
            TEX3: this.curBlock.texCoords,
            TEX4: this.curBlock.texCoords,
            TEX5: this.curBlock.texCoords,
            TEX6: this.curBlock.texCoords,
            TEX7: this.curBlock.texCoords,
        };
        if(LogRenderOps) console.log("Execute list", idx);

        let id = -1;
        if(this._isDrawingForPicker) {
            id = this.gx.addPickerObj({
                type:   'mapBlockDlist',
                block:  this.curBlock,
                list:   idx,
                stream: this.curStream,
                shader: this.curShader,
                params: this.params,
            });
        }
        const list = this.dlistParser.parse(
            this.curBlock.dlists[idx].data, dlistData, id);
        if(this.params.dlist < 0 || this.params.dlist == idx
        || this.params.dlist == undefined) {
            this.curBatch.addFunction(list);
            if(LogRenderOps) {
                console.log("executed list", this.curBlock.dlists[idx].data);
            }
        }
        else if(LogRenderOps) console.log("Skipping dlist", idx, list);
    }

    /** Change the vertex data format.
     */
    _renderOpSetVtxFmt() {
        const INDEX8 = 2, INDEX16 = 3;
        const ops    = this.curOps;
        let posSize  = ops.read(1) ? INDEX16 : INDEX8;
        let colSize=0, nrmSize=0;
        //only for character models; maps don't have normals
        //if((!this.curShader) || this.curShader.attrFlags & 1) {
        //    nrmSize = ops.read(1) ? INDEX16 : INDEX8;
        //}
        if((!this.curShader) || (this.curShader.attrFlags & 2)) {
            colSize = ops.read(1) ? INDEX16 : INDEX8;
        }
        let texSize  = ops.read(1) ? INDEX16 : INDEX8;
        if(this.params.isGrass) return;

        let TEX = [0, 0, 0, 0, 0, 0, 0, 0];
        if(this.curShader && !(this.curShader.flags & ShaderFlags.Water)) {
            for(let i=0; i<this.curShader.nLayers; i++) {
                TEX[i] = texSize;
            }
        }
        else TEX[0] = texSize;

        if(LogRenderOps) {
            console.log("Set vfmt: pos=%d col=%d tex=%d", posSize, colSize,
                texSize);
        }

        let PNMTXIDX = 0;
        let POS      = posSize;
        let NRM      = nrmSize;
        let COL      = [colSize, 0];

        this.gx.cp.setReg(0x55, //VCD FMT LO (VAT 5)
            (NRM << 11) | (POS <<  9) | (COL[0] << 13) | (COL[1] << 15));
        this.gx.cp.setReg(0x65, //VCD FMT HI (VAT 5)
            TEX[0] | (TEX[1] <<  2) | (TEX[2] <<  4) | (TEX[3] <<  6) |
            (TEX[4] <<  8) | (TEX[5] << 10) | (TEX[6] << 12) | (TEX[7] << 14));
    }

    /** Load one of the block's matrices into GX XF registers.
     */
    _renderOpMatrix() {
        const ops   = this.curOps;
        const count = ops.read(4);
        const mtxs  = [];
        for(let i=0; i<count; i++) {
            mtxs.push(ops.read(8)); //idxs into mtxs (XXX where are they?)
        }
        //XXX which XF reg do we write to?
        //it looks like the game just reads this opcode and
        //doesn't actually do anything with it.
        if(LogRenderOps) console.log("init %d mtxs", count, mtxs);
    }
}
