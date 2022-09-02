import BitStreamReader from '../../../game/BitStreamReader.js';
import { Reg as CPReg } from '../gl/gx/CP.js';
import DlistParser from '../gl/gx/DlistParser.js';
import RenderBatch from '../gl/gx/RenderBatch.js';
import GX from '../gl/gx/GX.js';
import Box from '../gl/Model/Box.js';

//XXX ton of duplication with BlockRenderer...

const LogRenderOps = true;
const DefaultCull = GX.CullMode.BACK;

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

export default class ModelRenderer {
    /** Renders models. */
    constructor(modelViewer, gx) {
        this.modelViewer = modelViewer;
        this.game = modelViewer.game;
        this.gx = gx;
        this.gl = gx.gl;
        this.dlistParser = new DlistParser(gx);
        this.reset();
    }

    reset() {
        this.pickerIds = {}; //id => list
        this._batches  = {};
    }

    _getBatch(name, model, params) {
        const key = [name, model.id, params.isPicker ? 1 :0].join(',');
        let batch = this._batches[key];
        if(!batch) {
            batch = new RenderBatch(this.gx);
            this._batches[key] = batch;
        }
        return batch;
    }

    parse(model, params={}) {
        /** Parse the display lists.
         *  @param {Model} model The model to render.
         *  @param {object} params Render parameters.
         *  @returns {RenderBatch} Parsed render batch.
         */
        const gx = this.gx;
        const gl = this.gx.gl;

        //check if we already parsed this
        const key = ([
            model.id,
            params.isPicker ? 1 : 0,
            params.dlist,
        ]).join(',');
        if(this._batches[key]) return this._batches[key];

        console.log("parse model", model, params);
        this.curBatch = new RenderBatch(this.gx);
        this._batches[key] = this.curBatch;
        this._isDrawingForPicker = params.isPicker;
        this.curShaderIdx = null;
        this.curModel     = model;
        this.params       = params;

        //temp
        /*let shaders = {};
        for(let shader of model.shaders) {
            for(let name of Object.keys(shader)) {
                let val = shader[name];
                if(name == 'layer') {
                    for(let i=0; i<shader.layer.length; i++) {
                        let layer = shader.layer[i];
                        for(let n2 of Object.keys(layer)) {
                            let v2 = layer[n2];
                            let n = `layer${i}.${n2}`;
                            if(shaders[n] == undefined) shaders[n] = [];
                            shaders[n].push(v2);
                        }
                    }
                }
                else {
                    if(shaders[name] == undefined) shaders[name] = [];
                    shaders[name].push(val);
                }
            }
        }
        console.log(shaders);*/

        const ops = new BitStreamReader(model.renderInstrs);
        this.curOps = ops;

        let done = false;
        this._setInitialGxParams();
        console.log("initial GX params have been set");
        while(!done && !ops.isEof) {
            //this is similar but not identical to the render instructions
            //used for map blocks.
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
                    console.log("Done render stream");
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

        console.log("Loaded model", model);
        return this._batches[key];
    }

    _setInitialGxParams() {
        //set default vtx formats for rendering model geometry
        this.gx.cp.setReg(CPReg.ARRAY_STRIDE_VTXS,   6); //sizeof(vec3s)
        this.gx.cp.setReg(CPReg.ARRAY_STRIDE_NORMALS,6); //sizeof(vec3s)
        this.gx.cp.setReg(CPReg.ARRAY_STRIDE_COLOR,  2); //sizeof(u16)
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

    render(model, params={}) {
        /** Render the model.
         *  @param {Model} model The model to render.
         *  @param {object} params Render parameters.
         *  @returns {RenderBatch} The render batch.
         */
        this.curShaderIdx = null;
        this.curModel     = model;
        this.params       = params;
        const batch       = this.parse(model, params);
        if(batch) {
            //console.log("execute render batch", batch);
            this.gx.executeBatch(batch);
            //this.gx.gl.flush();
        }
        return batch;
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
                console.log("using texture", slot, tex);
                gl.activeTexture(gl.TEXTURE0 + slot);
                if(tex) tex.bind();
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

        this.curShader = this.curModel.shaders[idx];
        if(!this.curShader) {
            console.warn("Invalid shader idx", idx);
        }

        this.curShaderIdx = idx;
        if(LogRenderOps) {
            this.curBatch.addFunction(() => {
                console.log("Select shader %d", idx, this.curShader);
                //console.log("Select texture %d: shader flags=%s", idx,
                //    this.curShader.attrFlags);
            });
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
                    if(idx >= 0 && this.curModel.textures[idx]) {
                        tex = this.curModel.textures[idx];
                    }
                    console.log("select texture", idx, tex);
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
        if(this.curModel.dlists[idx] == undefined) {
            throw new Error(`Calling list ${idx} but max is ${this.curModel.dlists.length}`);
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
        //if(idx > 23) return; //HACK

        const dlistData = {
            POS:  this.curModel.vtxPositions,
            NRM:  this.curModel.vtxNormals,
            COL0: this.curModel.vtxColors,
            TEX0: this.curModel.texCoords,
            TEX1: this.curModel.texCoords,
            TEX2: this.curModel.texCoords,
            TEX3: this.curModel.texCoords,
            TEX4: this.curModel.texCoords,
            TEX5: this.curModel.texCoords,
            TEX6: this.curModel.texCoords,
            TEX7: this.curModel.texCoords,
        };
        /*if(LogRenderOps) {
            console.log("Execute list", idx,
                "GX STATE", this.gx.cp.getState(),
                "BUFFERS",  dlistData);
        }*/

        let id = -1;
        if(this._isDrawingForPicker) {
            id = this.gx.addPickerObj({
                type:   'modelDlist',
                model:  this.curModel,
                list:   idx,
                stream: this.curStream,
                shader: this.curShader,
                params: this.params,
            });
        }
        const list = this.dlistParser.parse(
            this.curModel.dlists[idx].data, dlistData, id);
        if(this.params.dlist < 0 || this.params.dlist == idx
        || this.params.dlist == undefined) {
            if(LogRenderOps) {
                this.curBatch.addFunction(() => {
                    console.log("Exec dlist", idx,
                        this.curModel.dlists[idx].data);
                });
            }

            this.curBatch.addFunction(list);

            if(LogRenderOps) {
                this.curBatch.addFunction(() => {
                    console.log("Finished list");
                });
            }
        }
        else if(LogRenderOps) {
            this.curBatch.addFunction(() => {
                console.log("Skipping dlist", idx, list);
            });
        }
    }

    _renderOpSetVtxFmt() {
        /** Change the vertex data format.
         */
        const VAT=6; //5 for maps, 6 for characters
        const NONE=0, DIRECT=1, INDEX8=2, INDEX16=3;
        const ops    = this.curOps;
        let sizes = {
            PMTX: 0,
            TMTX: [0,0,0,0,0,0,0,0],
            POS:  0,
            NRM:  0,
            COL:  [0,0],
            TEX:  [0,0,0,0,0,0,0,0],
        }
        let triNrm = false;
        const aFlags = this.curShader ? this.curShader.attrFlags : 0;

        //sizes.TMTX[0] = 1; //HACK
        if(this.curModel.header.nBones < 2) {
            //GXSetCurrentMtx(0);
        }
        else {
            sizes.PMTX = DIRECT;
            let which = 0; //T0MIDX;
            //texture, lighting => auxTex0, auxTex1
            //Shader vs ShaderDef, it's confusing...
            if(this.curShader && (
            (this.curShader.auxTex0 >= 0) ||
            (this.curShader.auxTex1 >= 0))) {
                let which_00 = which;
                if(this.curShader.auxTex2 >= 0) {
                    //If the material has textures, we have
                    //texcoord matrices 0,1
                    sizes.TMTX[0] = DIRECT;
                    which_00 = 2; //T2MIDX;
                    sizes.TMTX[1] = DIRECT;
                }
                which = which_00 + 1;
                //if we have image/light textures, we have
                //texcoord mtx 1 (or 3 if we have material)
                sizes.TMTX[which_00] = DIRECT;
            }
            let texN2 = 7; //T7MIDX;
            let enable, next;
            let flags = 0;
            /* flags:
            1:NoFog, 2:EXTRA_FUZZY, 4:DrawFuzz, 8:ForceFuzz */
            for(let idx = 0; idx < this.curModel.header.nTexMtxs; idx++) {
                if (((flags & 0xff) == 4) && (idx == 0)) {
                    /*if((nTextureMtxs_803dcc5c == 0) ||
                    (FUN_8001d7f8(PTR_803dcc64,local_38,auStack52), local_38 != 0)) {
                        enable = false;
                    }
                    else {
                        enable = true;
                    }*/
                    enable = false;
                }
                else if((idx < 0 /*nTextureMtxs_803dcc5c*/) && ((flags & 0xff) == 0)) {
                    enable = true;
                }
                else {
                    enable = false;
                }
                if(enable) {
                    sizes.TMTX[which] = DIRECT;
                    next = texN2;
                    which = which + 1;
                }
                else {
                    next = texN2 - 1;
                    sizes.TMTX[texN2] = DIRECT;
                }
                texN2 = next;
            }
        }
        sizes.POS = ops.read(1) ? INDEX16 : INDEX8;

        if(aFlags & 1) {
            sizes.NRM = ops.read(1) ? INDEX16 : INDEX8;
        }
        if(aFlags & 2) {
            sizes.COL[0] = ops.read(1) ? INDEX16 : INDEX8;
        }
        else sizes.COL[0] = 0;
        let texSize = ops.read(1) ? INDEX16 : INDEX8;
        if(this.params.isGrass) return;

        //XXX copied from map block. models always have shaders.
        if(this.curShader) {
            for(let i=0; i<this.curShader.nLayers; i++) {
                sizes.TEX[i] = texSize;
            }
        }
        else sizes.TEX[0] = texSize;

        if(LogRenderOps) {
            this.curBatch.addFunction(() => {
                console.log("Set vfmt: pos=%d nrm=%d col=%d tex=%d",
                    sizes.POS, sizes.NRM, sizes.COL[0], sizes.TEX[0],
                        sizes, this.curShader);
            });
        }

        this.gx.cp.setReg(0x50 | VAT, //VCD FMT LO
            (sizes.PMTX ? 1 : 0) |
            ((sizes.TMTX[0] ? 1 : 0) << 1) |
            ((sizes.TMTX[1] ? 1 : 0) << 2) |
            ((sizes.TMTX[2] ? 1 : 0) << 3) |
            ((sizes.TMTX[3] ? 1 : 0) << 4) |
            ((sizes.TMTX[4] ? 1 : 0) << 5) |
            ((sizes.TMTX[5] ? 1 : 0) << 6) |
            ((sizes.TMTX[6] ? 1 : 0) << 7) |
            ((sizes.TMTX[7] ? 1 : 0) << 8) |
            (sizes.POS <<  9) | (sizes.NRM << 11) |
            (sizes.COL[0] << 13) | (sizes.COL[1] << 15));
        this.gx.cp.setReg(0x60 | VAT, //VCD FMT HI
             sizes.TEX[0]        | (sizes.TEX[1] <<  2) |
            (sizes.TEX[2] <<  4) | (sizes.TEX[3] <<  6) |
            (sizes.TEX[4] <<  8) | (sizes.TEX[5] << 10) |
            (sizes.TEX[6] << 12) | (sizes.TEX[7] << 14));

        let r70 = this.gx.cp.getReg(0x70 | VAT);
        if(triNrm) r70 |= (1 << 31);
        else r70 &= ~(1 << 31);
        this.gx.cp.setReg(0x70 | VAT, r70); //VCD FMT A
    }

    _renderOpMatrix() {
        /** Load one of the block's matrices into GX XF registers.
         */
        const model = this.curModel;
        const tbl = [ //not sure why the game does this
             0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 0, 0,
            10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 0, 0];
        const ops   = this.curOps;
        const count = ops.read(4);
        const nMax  = model.header.nVtxGroups + model.header.nBones;
        let mtxs = {};
        let idxs = []; //for debug

        for(let i=0; i<count; i++) {
            let iMtx = ops.read(8);
            console.assert(iMtx < nMax);
            idxs.push(iMtx);
            let xl = model.xlates[iMtx];
            mtxs[tbl[i]*3] = mat4.fromValues(
                1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,
                xl[0], xl[1], xl[2], 1);
        }
        this.curBatch.addFunction(() => {
            for(let [r,v] of Object.entries(mtxs)) {
                this.gx.xf.setMtx(r, v);
            }
            this.gx.syncXF();
        });
        if(LogRenderOps) {
            this.curBatch.addFunction(() => {
                console.log("init %d mtxs", count, idxs, mtxs);
            });
        }
    }
}
