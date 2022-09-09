import SfaModel from "./Model.js";
import BitStreamReader from "../BitStreamReader.js";
import GX from "../../app/ui/gl/gx/GX.js";
import { Reg as CPReg } from "../../app/ui/gl/gx/CP.js";
import RenderBatch from "../../app/ui/gl/gx/RenderBatch.js";
import DlistParser from "../../app/ui/gl/gx/DlistParser.js";

const LogRenderOps = false;
const DefaultCull  = GX.CullMode.BACK;
const ShaderFlags  = {
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
    { //VAT 5 (map blocks)
        POSCNT:  1, POSFMT:  3, POSSHFT:   3, //s16
        NRMCNT:  0, NRMFMT:  1, NRMSHFT:   0, //s8
        COL0CNT: 1, COL0FMT: 3, COL0SHFT:  0, //rgba4444
        TEX0CNT: 1, TEX0FMT: 3, TEX0SHFT:  8, //s16
        TEX1CNT: 1, TEX1FMT: 3, TEX1SHFT:  8, //s16
        TEX2CNT: 1, TEX2FMT: 3, TEX2SHFT:  8, //s16
        TEX3CNT: 1, TEX3FMT: 3, TEX3SHFT:  8, //s16
    },
    { //VAT 6 (character models)
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

export default class RenderStreamParser {
    /** Parses and executes the bit-packed render
     *  opcode streams from map blocks and character
     *  models.
     */
    constructor(gx) {
        /** Construct RenderStream.
         *  @param {GX} gx The GX instance to use.
         */
        this.gx = gx;
        this.gl = gx.gl;
    }

    execute(model, reader, params={}) {
        /** Execute the instructions in the stream.
         *  @param {SfaModel, MapBlock} model The model to render.
         *  @param {BitStreamReader} reader Stream to read from.
         *  @param {Object} params Additional render parameters.
         *  @returns {RenderBatch} The resulting render batch.
         */
        this.model  = model;
        this.reader = reader;
        this.params = params;
        this.isMap  = params.isMap; //is map block or character model?
        this.VAT    = this.isMap ? 5 : 6;
        this.batch  = new RenderBatch(this.gx);
        this.shader = null;
        this.shaderIdx = null;
        this.dlistParser = new DlistParser(this.gx);
        if(params.vtxHandler) {
            this.dlistParser.setVtxHandler(params.vtxHandler);
        }

        this._setInitialGxParams();

        let done = false;
        while((!done) && (!this.reader.isEof)) {
            if(this.reader.isEof == undefined) {
                //what the FUCK
                debugger;
                return;
            }
            const op = this.reader.read(4);
            switch(op) {
                case 1: this._renderOpTexture();   break;
                case 2: this._renderOpCallList();  break;
                case 3: this._renderOpSetVtxFmt(); break;
                case 0: //unused, but should be same as 4
                case 4: this._renderOpMatrix();    break;
                case null: //reached end of stream
                    console.error("Premature end of stream at bit 0x%s",
                    this.reader.offset.toString(16));
                    //fall thru
                case 5: //end
                    done = true;
                    break;
                default:
                    console.error("Unknown render op %d at bit 0x%s", op,
                        (this.reader.offset-4).toString(16));
            }
        }

        //do this or else everything breaks for some reason
        this.batch.addFunction(() => {
            this.gx.setShaderParams(
                DefaultCull, //cull mode
                GX.BlendMode.NONE, //blend mode
                GX.BlendFactor.ONE, //sFactor
                GX.BlendFactor.ZERO, //dFactor
                GX.LogicOp.NOOP, //logicOp
                true, //compareEnable
                GX.Compare.LEQUAL, //compareFunc
                true, //updateEnable
                true, //alphaTest
            );
            this.gx.sync();
        });

        return this.batch;
    }

    _setInitialGxParams() {
        this.gx.xf.reset();
        this.gx.syncXF();

        //set default vtx formats for rendering model geometry
        this.gx.cp.setReg(CPReg.ARRAY_STRIDE_VTXS,   6); //sizeof(vec3s)
        this.gx.cp.setReg(CPReg.ARRAY_STRIDE_NORMALS,6); //sizeof(vec3s)
        this.gx.cp.setReg(CPReg.ARRAY_STRIDE_COLOR,  2); //sizeof(u16)
        for(let i=0; i<8; i++) {
            this.gx.cp.setReg(CPReg.ARRAY_STRIDE_TEXCOORD+i, 4); //sizeof(vec2s)
            this.gx.cp.setVatFormat(i, vatDefaults[i]);
        }

        //set initial render modes (XXX verify)
        if(this.params.isPicker) {
            this.batch.addFunction(() => {this.gx.setShaderParams(
                DefaultCull, //cull backfaces
                GX.BlendMode.NONE, GX.BlendFactor.SRCALPHA,
                GX.BlendFactor.INVSRCALPHA, GX.LogicOp.NOOP,
                true, GX.Compare.LEQUAL, true, //depth test+update enabled
                true); //alpha test enabled
                this.gx.setAlphaCompare(GX.Compare.GREATER, 0,
                    GX.AlphaOp.AND, GX.Compare.GREATER, 0);
            });
        }
        else this.batch.addFunction(() => {this.gx.setShaderParams(
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
        const flags = this.shader.flags;

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
        if(!this.params.isPicker) {
            this.batch.addFunction(() => {
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

    _renderOpTexture() {
        /** Select a texture and shader.
         *  This can affect how later commands are interpreted.
         */
        const gx  = this.gx;
        const gl  = this.gx.gl;
        const ops = this.reader;
        const idx = ops.read(6);
        if(this.params.isGrass) return;
        if(this.shaderIdx == idx) return;

        this.shader = this.model.shaders[idx];
        if(!this.shader) {
            console.warn("Invalid shader idx", idx);
        }

        this.shaderIdx = idx;
        if(LogRenderOps) {
            this.batch.addFunction(() => {
                //console.log("Select shader %d", idx, this.shader);
                //console.log("Select texture %d: shader flags=%s", idx,
                //    this.shader.attrFlags);
            });
        }

        if(this.params.isPicker) {
            this.batch.addFunction(() => {this.gx.setShaderParams(
                DefaultCull, //cull backfaces
                GX.BlendMode.NONE, //blend mode
                GX.BlendFactor.ONE, //sFactor
                GX.BlendFactor.ZERO, //dFactor
                GX.LogicOp.NOOP, //logicOp
                true, //compareEnable
                GX.Compare.LEQUAL, //compareFunc
                true, //updateEnable
                true, //alphaTest
            )});
        }
        else if(this.shader) {
            this._handleShaderFlags();
        }
        else {
            this.batch.addFunction(() => {
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

        const nLayers = this.shader ? this.shader.nLayers : 0;
        const textures  = []; //batch these ops
        for(let i=0; i<gx.MAX_TEXTURES; i++) {
            let tex = gx.blankTexture;
            if(i < nLayers) {
                const idx = this.shader.layer[i].texture;
                if(idx >= 0 && this.model.textures[idx]) {
                    tex = this.model.textures[idx];
                }
                //console.log("select texture", idx, tex);
            }
            textures.push([i, tex]);
        }
        if(!this.params.isPicker) { //select the textures
            if(textures.length > 0) {
                this.batch.addFunction(this._makeSetTextureCmd(textures));
            }
        }

        if(this.params.shaderHandler) {
            this.params.shaderHandler(
                this.shader, this.shaderIdx, textures);
        }
    }

    _makeSetTextureCmd(params) {
        const gl = this.gl;
        return () => {
            for(let [slot, tex] of params) {
                //console.log("using texture", slot, tex);
                gl.activeTexture(gl.TEXTURE0 + slot);
                if(tex) tex.bind();
                gl.uniform1i(this.gx.programInfo.uniforms.uSampler[slot], slot);
            }
        };
    }

    _renderOpCallList() {
        /** Call one of the model's display lists.
         */
        const ops = this.reader;
        const idx = ops.read(8);
        if(this.model.dlists[idx] == undefined) {
            throw new Error(`Calling list ${idx} but max is ${this.model.dlists.length}`);
        }

        if(this.params.isGrass) {
            if(this.shader
            && (this.shader.flags & ShaderFlags.TranspRelated2000)) return;
        }
        if(!this.params.showHidden) {
            //don't render hidden polys
            if(this.shader
            && (this.shader.flags & ShaderFlags.Hidden)) return;
        }

        const dlistData = {
            POS:  this.model.vtxPositions,
            NRM:  this.isMap ? null : this.model.vtxNormals,
            COL0: this.model.vtxColors,
            TEX0: this.model.texCoords,
            TEX1: this.model.texCoords,
            TEX2: this.model.texCoords,
            TEX3: this.model.texCoords,
            TEX4: this.model.texCoords,
            TEX5: this.model.texCoords,
            TEX6: this.model.texCoords,
            TEX7: this.model.texCoords,
        };
        /*if(LogRenderOps) {
            console.log("Execute list", idx,
                "GX STATE", this.gx.cp.getState(),
                "BUFFERS",  dlistData);
        }*/

        let id = -1;
        if(this.params.isPicker) {
            id = this.gx.addPickerObj({
                type:   'dlist',
                model:  this.model,
                list:   idx,
                stream: this.stream,
                shader: this.shader,
                params: this.params,
            });
        }
        const list = this.dlistParser.parse(
            this.model.dlists[idx].data, dlistData, id);
        if(this.params.dlist < 0 || this.params.dlist == idx
        || this.params.dlist == undefined) {
            if(LogRenderOps) {
                this.batch.addFunction(() => {
                    console.log("Exec dlist", idx,
                        this.model.dlists[idx].data);
                });
            }

            this.batch.addFunction(list);

            if(LogRenderOps) {
                this.batch.addFunction(() => {
                    console.log("Finished list");
                });
            }
        }
        else if(LogRenderOps) {
            this.batch.addFunction(() => {
                console.log("Skipping dlist", idx, list);
            });
        }
    }

    _renderOpSetVtxFmt() {
        /** Change the vertex data format.
         */
        const ops = this.reader;
        let sizes = {
            PMTX: 0,
            TMTX: [0,0,0,0,0,0,0,0],
            POS:  0,
            NRM:  0,
            COL:  [0,0],
            TEX:  [0,0,0,0,0,0,0,0],
        }
        let triNrm = false;
        const aFlags = this.shader ? this.shader.attrFlags : 0;

        if(this.isMap || this.model.header.nBones < 2) {
            //GXSetCurrentMtx(0);
        }
        else {
            sizes.PMTX = GX.AttrType.DIRECT;
            let which = 0; //T0MIDX;
            //texture, lighting => auxTex0, auxTex1
            //Shader vs ShaderDef, it's confusing...
            if(this.shader && (
            (this.shader.auxTex0 >= 0) ||
            (this.shader.auxTex1 >= 0))) {
                let which_00 = which;
                if(this.shader.auxTex2 >= 0) {
                    //If the material has textures, we have
                    //texcoord matrices 0,1
                    sizes.TMTX[0] = GX.AttrType.DIRECT;
                    which_00 = 2; //T2MIDX;
                    sizes.TMTX[1] = GX.AttrType.DIRECT;
                }
                which = which_00 + 1;
                //if we have image/light textures, we have
                //texcoord mtx 1 (or 3 if we have material)
                sizes.TMTX[which_00] = GX.AttrType.DIRECT;
            }
            let texN2 = 7; //T7MIDX;
            let enable, next;
            let flags = 0;
            /* flags:
            1:NoFog, 2:EXTRA_FUZZY, 4:DrawFuzz, 8:ForceFuzz */
            for(let idx = 0; idx < this.model.header.nTexMtxs; idx++) {
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
                    sizes.TMTX[which] = GX.AttrType.DIRECT;
                    next = texN2;
                    which = which + 1;
                }
                else {
                    next = texN2 - 1;
                    sizes.TMTX[texN2] = GX.AttrType.DIRECT;
                }
                texN2 = next;
            }
        }
        sizes.POS = ops.read(1) ?
            GX.AttrType.INDEX16 : GX.AttrType.INDEX8;

        if((aFlags & 1) && !this.isMap) {
            sizes.NRM = ops.read(1) ?
                GX.AttrType.INDEX16 : GX.AttrType.INDEX8;
        }
        if(aFlags & 2) {
            sizes.COL[0] = ops.read(1) ?
                GX.AttrType.INDEX16 : GX.AttrType.INDEX8;
        }
        else sizes.COL[0] = 0;
        let texSize = ops.read(1) ?
            GX.AttrType.INDEX16 : GX.AttrType.INDEX8;
        if(this.params.isGrass) return;

        if(this.shader) {
            for(let i=0; i<this.shader.nLayers; i++) {
                sizes.TEX[i] = texSize;
            }
        }
        else sizes.TEX[0] = texSize;

        if(LogRenderOps) {
            this.batch.addFunction(() => {
                console.log("Set vfmt: pos=%d nrm=%d col=%d tex=%d",
                    sizes.POS, sizes.NRM, sizes.COL[0], sizes.TEX[0],
                        sizes, this.shader);
            });
        }

        this.gx.cp.setReg(0x50 | this.VAT, //VCD FMT LO
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
        this.gx.cp.setReg(0x60 | this.VAT, //VCD FMT HI
             sizes.TEX[0]        | (sizes.TEX[1] <<  2) |
            (sizes.TEX[2] <<  4) | (sizes.TEX[3] <<  6) |
            (sizes.TEX[4] <<  8) | (sizes.TEX[5] << 10) |
            (sizes.TEX[6] << 12) | (sizes.TEX[7] << 14));

        let r70 = this.gx.cp.getReg(0x70 | this.VAT);
        if(triNrm) r70 |= (1 << 31);
        else r70 &= ~(1 << 31);
        this.gx.cp.setReg(0x70 | this.VAT, r70); //VCD FMT A
    }

    _renderOpMatrix() {
        /** Load one of the model's matrices into GX XF registers.
         */
        const mtxs  = {};
        const idxs  = [];

        const count = this.reader.read(4);
        //console.log("Load %d mtxs", count);
        //if(count == 0) debugger;
        //following data is indices into the model's matrix list.
        for(let i=0; i<count; i++) {
            idxs.push(this.reader.read(8));
        }
        //for map blocks the game reads the indices but
        //doesn't do anything with them.
        if(this.isMap) return;

        const tbl = [ //not sure why the game does this
             0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 0, 0,
            10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 0, 0];

        const nMax  = this.model.header.nVtxGroups +
            this.model.header.nBones;

        for(let i=0; i<count; i++) {
            let iMtx = idxs[i];
            console.assert(iMtx < nMax);

            //we only store the translation vector, not the
            //full transformation matrix.
            let xl = this.model.xlates[iMtx];
            if(xl == undefined) xl = [0,0,0];
            mtxs[tbl[i]*3] = mat4.fromValues(
                1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,
                xl[0], xl[1], xl[2], 1);
        }
        this.batch.addFunction(() => {
            for(let [r,v] of Object.entries(mtxs)) {
                this.gx.xf.setMtx(r, v);
            }
            this.gx.syncXF();
        });
    }
}
