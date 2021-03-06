import BitStreamReader from '../../../game/BitStreamReader.js';
import { Reg as CPReg } from '../gl/gx/CP.js';
import DlistParser from '../gl/gx/DlistParser.js';
import RenderBatch from '../gl/gx/RenderBatch.js';
import GX from '../gl/gx/GX.js';
import { MAP_CELL_SIZE } from '../../../game/Game.js';
import Box from '../gl/Model/Box.js';

//struct types
let HitsBinEntry, SurfaceType;

const LogRenderOps = false;
const ShaderFlags = {
    Hidden:             (1<< 1), //invisible, exploded walls, etc
    Fog:                (1<< 2), //enable fog
    CullBackface:       (1<< 3),
    ReflectSkyscape:    (1<< 5),
    Caustic:            (1<< 6),
    Lava:               (1<< 7),
    Reflective:         (1<< 8), //Occurs on Krazoa Palace reflective floors
    FuzzRelated:        (1<< 9),
    AlphaCompare:       (1<<10),
    TranspRelated2000:  (1<<13),
    ShortFur:           (1<<14), //4 layers
    MediumFur:          (1<<15), //8 layers
    LongFur:            (1<<16), //16 layers
    StreamingVideo:     (1<<17), //Occurs on video panels in Great Fox. Used to display preview video.
    IndoorOutdoorBlend: (1<<18), //Occurs near cave entrances and windows. Requires special handling for lighting.
    BlendFlag29:        (1<<29),
    ForceBlend:         (1<<30),
    Water:              (1<<31),
};

//from noclip
/* export enum ShaderAttrFlags {
    NRM = 0x1,
    CLR = 0x2,
}
export const enum NormalFlags {
    HasVertexColor = 0x2,
    NBT = 0x8,
    HasVertexAlpha = 0x10,
}
export const enum LightFlags {
    OverrideLighting = 0x2,
} */

const DefaultCull = GX.CullMode.BACK;

const vatDefaults = [
    //these are set in videoInit() and almost never change
    { //VAT 0
        POSCNT:  1, POSFMT:  3, POSSHFT:   0, //s16
        COL0CNT: 1, COL0FMT: 5, COL0SHFT:  0, //rgba8888
        TEX0CNT: 1, TEX0FMT: 3, TEX0SHFT:  7, //s16
    },
    { //VAT 1
        POSCNT:  1, POSFMT:  3, POSSHFT:   2, //s16
        COL0CNT: 1, COL0FMT: 5, COL0SHFT:  0, //rgba8888
        TEX0CNT: 1, TEX0FMT: 4, TEX0SHFT:  0, //float
    },
    { //VAT 2
        POSCNT:  1, POSFMT:  4, POSSHFT:   0, //float
        NRMCNT:  0, NRMFMT:  4, NRMSHFT:   0, //float
        COL0CNT: 1, COL0FMT: 5, COL0SHFT:  0, //rgba8888
        TEX0CNT: 1, TEX0FMT: 4, TEX0SHFT:  0, //float
        TEX1CNT: 1, TEX1FMT: 4, TEX1SHFT:  0, //float
    },
    { //VAT 3
        POSCNT:  1, POSFMT:  3, POSSHFT:   8, // s16
        NRM3CNT: 1, NRM3FMT: 1, NRM3SHFT:  0, // s8
        COL0CNT: 1, COL0FMT: 3, COL0SHFT:  0, // rgba4444
        TEX0CNT: 1, TEX0FMT: 3, TEX0SHFT: 10, // s16
        TEX1CNT: 1, TEX1FMT: 3, TEX1SHFT: 10, // s16
        TEX2CNT: 1, TEX2FMT: 3, TEX2SHFT: 10, // s16
        TEX3CNT: 1, TEX3FMT: 3, TEX3SHFT: 10, // s16
    },
    { //VAT 4
        POSCNT:  1, POSFMT:  4, POSSHFT:   0, //float
        COL0CNT: 1, COL0FMT: 5, COL0SHFT:  0, //rgba8888
        TEX0CNT: 1, TEX0FMT: 3, TEX0SHFT:  7, //s16
        NRMCNT:  0, NRMFMT:  4, NRMSHFT:   0, //float
    },
    { //VAT 5
        POSCNT:  1, POSFMT:  3, POSSHFT:   3, //s16
        NRMCNT:  0, NRMFMT:  1, NRMSHFT:   0, //s8
        COL0CNT: 1, COL0FMT: 3, COL0SHFT:  0, //rgba4444
        TEX0CNT: 1, TEX0FMT: 3, TEX0SHFT:  8, //s16
        TEX1CNT: 1, TEX1FMT: 3, TEX1SHFT:  8, //s16
        TEX2CNT: 1, TEX2FMT: 3, TEX2SHFT:  8, //s16
        TEX3CNT: 1, TEX3FMT: 3, TEX3SHFT:  8, //s16
    },
    { //VAT 6
        POSCNT:  1, POSFMT:  3, POSSHFT:   8, //s16
        NRMCNT:  0, NRMFMT:  1, NRMSHFT:   0, //s8
        COL0CNT: 1, COL0FMT: 3, COL0SHFT:  0, //rgba4444
        TEX0CNT: 1, TEX0FMT: 3, TEX0SHFT: 10, //s16
        TEX1CNT: 1, TEX1FMT: 3, TEX1SHFT: 10, //s16
        TEX2CNT: 1, TEX2FMT: 3, TEX2SHFT: 10, //s16
        TEX3CNT: 1, TEX3FMT: 3, TEX3SHFT: 10, //s16
    },
    { //VAT 7
        POSCNT:  1, POSFMT:  3, POSSHFT:   0, //s16
        NRMCNT:  0, NRMFMT:  1, NRMSHFT:   0, //s8
        COL0CNT: 1, COL0FMT: 3, COL0SHFT:  0, //rgba4444
        TEX0CNT: 1, TEX0FMT: 3, TEX0SHFT: 10, //s16
        TEX1CNT: 1, TEX1FMT: 3, TEX1SHFT: 10, //s16
        TEX2CNT: 1, TEX2FMT: 3, TEX2SHFT: 10, //s16
        TEX3CNT: 1, TEX3FMT: 3, TEX3SHFT: 10, //s16
    },
];

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

function _setShaderParams(gl, gx, cullMode, blendMode, sFactor, dFactor,
logicOp, compareEnable, compareFunc, updateEnable, alphaTest) {
    switch(cullMode) {
        case GX.CullMode.NONE: gl.disable(gl.CULL_FACE); break;
        case GX.CullMode.FRONT:
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.FRONT);
            break;
        case GX.CullMode.BACK:
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);
            break;
        case GX.CullMode.ALL:
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.FRONT_AND_BACK);
            break;
    }
    gx.setBlendMode(blendMode, sFactor, dFactor, logicOp);
    gx.setZMode(compareEnable, compareFunc, updateEnable);
    gx.setUseAlphaTest(alphaTest);
}

export default class BlockRenderer {
    /** Renders map blocks. */
    constructor(mapViewer, gx) {
        this.mapViewer = mapViewer;
        this.game = mapViewer.game;
        HitsBinEntry = this.game.app.types.getType('sfa.maps.HitsBinEntry');
        SurfaceType  = this.game.app.types.getType('sfa.maps.SurfaceType');
        this.gx = gx;
        this.gl = gx.gl;
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

    parse(block, whichStream, params={}) {
        /** Parse the display lists.
         *  @param {Block} block The block to render.
         *  @param {string} whichStream One of 'main', 'water', 'reflective'
         *   specifying which bitstream to use.
         *  @param {object} params Render parameters.
         *  @returns {RenderBatch} Parsed render batch.
         */
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

        //console.log("parsing", block, whichStream);
        this.curBatch = new RenderBatch(this.gx);
        this._batches[key] = this.curBatch;
        this._isDrawingForPicker = params.isPicker;
        this.curShaderIdx = null;
        this.curBlock     = block;
        this.curStream    = whichStream;
        this.params       = params;

        const ops = new BitStreamReader(block.renderInstrs[whichStream]);
        this.curOps = ops;

        let done = false;
        this._setInitialGxParams(whichStream);
        this.curBatch.addFunction(() => { this.setMtxForBlock(block) });
        while(!done && !ops.isEof) {
            //this is similar but not identical to the render instructions
            //used for character models.
            const op = ops.read(4);
            switch(op) {
                case 1: this._renderOpTexture();   break;
                case 2: this._renderOpCallList();  break;
                case 3: this._renderOpSetVtxFmt(); break;
                case 0: //unused, but should be same as 4
                case 4: this._renderOpMatrix();    break;

                case null: //reached end of stream
                    console.error("Premature end of stream at bit 0x%s",
                        ops.offset.toString(16));
                case 5: //end
                    //console.log("Done rendering", whichStream);
                    done = true;
                    break;

                default:
                    console.error("Unknown render op %d at bit 0x%s", op,
                        (ops.offset-4).toString(16));
            }
        }

        this.curBatch.addFunction(() => {_setShaderParams(gl, gx,
            DefaultCull, //cull mode
            GX.BlendMode.NONE, //blend mode
            GX.BlendFactor.ONE, //sFactor
            GX.BlendFactor.ZERO, //dFactor
            GX.LogicOp.NOOP, //logicOp
            true, //compareEnable
            GX.Compare.LEQUAL, //compareFunc
            true, //updateEnable
            true, //alphaTest
        )});

        return this._batches[key];
    }

    setMtxForBlock(block, yOffset=true) {
        /** Set the ModelView matrix to position at a block.
         *  @param {MapBlock} block Block to position at.
         *  @param {boolean} yOffset Whether to include the block's Y offset.
         */
        if(!block) return;
        let mv = mat4.clone(this.gx.context.matModelView);
        const map = this.mapViewer.map;
        const offsX = (block.x-map.originX)*MAP_CELL_SIZE;
        const offsY = yOffset ? block.header.yOffset : 0;
        const offsZ = (block.z-map.originZ)*MAP_CELL_SIZE;
        mat4.translate(mv, mv, vec3.fromValues(offsX, offsY, offsZ));
        this.gx.setModelViewMtx(mv);
    }

    render(block, whichStream, params={}) {
        /** Render the block.
         *  @param {Block} block The block to render.
         *  @param {string} whichStr{eam One of 'main', 'water', 'reflective'
         *   specifying which bitstream to use.
         *  @param {object} params Render parameters.
         *  @returns {RenderBatch} The render batch.
         */
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

    renderHits(block, params) {
        /** Render the block's hit-lines from HITS.bin. */
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
            _setShaderParams(
                this.gx.gl, this.gx, GX.CullMode.NONE,
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

    renderCollisionMesh(block, params) {
        /** Render the block's collision mesh. */
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

    renderPolyGroups(block, params) {
        /** Render the block's polygon group bounding boxes. */
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
            this.curBatch.addFunction(() => {_setShaderParams(
                this.gx.gl, this.gx, DefaultCull, //cull backfaces
                GX.BlendMode.NONE, GX.BlendFactor.SRCALPHA,
                GX.BlendFactor.INVSRCALPHA, GX.LogicOp.NOOP,
                true, GX.Compare.LEQUAL, true, //depth test+update enabled
                true); //alpha test enabled
                this.gx.setAlphaCompare(GX.Compare.GREATER, 0,
                    GX.AlphaOp.AND, GX.Compare.GREATER, 0);
            });
        }
        else if(whichStream == 'reflective') {
            this.curBatch.addFunction(() => {_setShaderParams(
                this.gx.gl, this.gx, DefaultCull, //cull backfaces
                GX.BlendMode.NONE, GX.BlendFactor.SRCALPHA,
                GX.BlendFactor.INVSRCALPHA, GX.LogicOp.NOOP,
                true, GX.Compare.LEQUAL, true, //depth test+update enabled
                true); //alpha test enabled
                this.gx.setAlphaCompare(GX.Compare.ALWAYS, 0,
                    GX.AlphaOp.AND, GX.Compare.ALWAYS, 0);
            });
        }
        else this.curBatch.addFunction(() => {_setShaderParams(
            this.gx.gl, this.gx, DefaultCull, //cull backfaces
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
                _setShaderParams(gl, gx, cull, blendMode, sFactor, dFactor,
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

    _renderOpTexture() {
        /** Select a texture and shader.
         *  This can affect how later commands are interpreted.
         */
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

        /*if(this._isDrawingForPicker) {
            this.curBatch.addFunction(() => {_setShaderParams(gl, gx,
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
        else*/ if(this.curShader) {
            this._handleShaderFlags();
        }
        else if(this.curStream == 'water'
        || this.curStream == 'reflective') { //XXX verify these
            this.curBatch.addFunction(() => {_setShaderParams(gl, gx,
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
                _setShaderParams(gl, gx,
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

        //if(!this._isDrawingForPicker) { //select the textures
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
        //}
    }

    _renderOpCallList() {
        /** Call one of the block's display lists.
         */
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
            //NRM:  this.curBlock.normals, //map blocks don't have normals
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
        if(this.params.dlist < 0 || this.params.dlist == idx) {
            this.curBatch.addFunction(list);
        }
        if(LogRenderOps) {
            console.log("executed list", this.curBlock.dlists[idx].data);
        }
    }

    _renderOpSetVtxFmt() {
        /** Change the vertex data format.
         */
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

    _renderOpMatrix() {
        /** Load one of the block's matrices into GX XF registers.
         */
        const ops   = this.curOps;
        const count = ops.read(4);
        const mtxs  = [];
        for(let i=0; i<count; i++) {
            //can't read more than 24 bits at once
            mtxs.push(ops.read(8)); //idxs into mtxs (XXX where are they?)
        }
        //XXX which XF reg do we write to?
        if(LogRenderOps) console.log("init %d mtxs", count, mtxs);
    }
}
