import VertexBuffer from './VertexBuffer.js';
//import BP from './BP.js';
import CP from './CP.js';
import XF from './XF.js';
import DlistParser from './DlistParser.js';
import Program from '../Program.js';
import Texture from '../Texture.js';
import {get} from '/r/js/Util.js';
import RenderBatch from './RenderBatch.js';
import GXConstants from './Constants.js';

function CHECK_ERROR(gl) {
    const err = gl.getError();
    console.assert(!err);
}

//the order the fields appear in in a display list. this never changes.
export const VAT_FIELD_ORDER = [
    'PNMTXIDX', 'T0MIDX', 'T1MIDX', 'T2MIDX', 'T3MIDX', 'T4MIDX',
    'T5MIDX', 'T6MIDX', 'T7MIDX', 'POS', 'NRM', 'COL0', 'COL1',
    'TEX0', 'TEX1', 'TEX2', 'TEX3', 'TEX4', 'TEX5', 'TEX6',
    'TEX7'];

const _GX_TF_CTF = 0x20; /* copy-texture-format only */
const _GX_TF_ZTF = 0x10; /* Z-texture-format */

export default class GX extends GXConstants {
    /** GameCube GPU simulator.
     *  While nowhere near precise enough to be considered an emulator, this
     *  class functions roughly the same as the real GX chip - give it arrays
     *  containing display list and vertex attribute data, set up the registers
     *  telling how the data is formatted, and it renders an image.
     */
    constructor(context) {
        this.context = context;
        this.gl      = context.gl;
        this._buildGlTables();
        //used for when we want an invisible texture (eg to fill unused
        //texture slots)
        this.blankTexture = new Texture(context);
        this.blankTexture.makeSolidColor(255, 0, 255, 0);
        //used for when we want a plain white texture (eg to render polygons
        //without any textures)
        this.whiteTexture = new Texture(context);
        this.whiteTexture.makeSolidColor(255, 255, 255, 255);
        //used for when a texture can't be loaded.
        this.missingTexture = new Texture(context);
        this.missingTexture.loadFromImage('/r/missing-texture.png');
        //if changing this we need to also add more samplers in the fragment
        //shader and update loadPrograms()
        this.MAX_TEXTURES = 2;
        //this.bp           = new BP(this);
        this.cp           = new CP(this);
        this.xf           = new XF(this);
        this.vtxBuf       = new VertexBuffer(this);
        this.dlistParser  = new DlistParser(this);
        this.pickerObjs   = []; //idx => obj
    }

    _buildGlTables() {
        const gl = this.gl;
        this.BlendFactorMap = {
            [GX.BlendFactor.ZERO]:        gl.ZERO,
            [GX.BlendFactor.ONE]:         gl.ONE,
            [GX.BlendFactor.SRCCLR]:      gl.SRC_COLOR,
            [GX.BlendFactor.INVSRCCLR]:   gl.ONE_MINUS_SRC_COLOR,
            [GX.BlendFactor.SRCALPHA]:    gl.SRC_ALPHA,
            [GX.BlendFactor.INVSRCALPHA]: gl.ONE_MINUS_SRC_ALPHA,
            [GX.BlendFactor.DSTALPHA]:    gl.DST_ALPHA,
            [GX.BlendFactor.INVDSTALPHA]: gl.ONE_MINUS_DST_ALPHA,
        };
        this.CompareModeMap = {
            [GX.Compare.NEVER]:   gl.NEVER,
            [GX.Compare.LESS]:    gl.LESS,
            [GX.Compare.EQUAL]:   gl.EQUAL,
            [GX.Compare.LEQUAL]:  gl.LEQUAL,
            [GX.Compare.GREATER]: gl.GREATER,
            [GX.Compare.NEQUAL]:  gl.NOTEQUAL,
            [GX.Compare.GEQUAL]:  gl.GEQUAL,
            [GX.Compare.ALWAYS]:  gl.ALWAYS,
        };
    }

    reset() {
        /** Reset all state to default.
         */
        const gl = this.gl;
        //this.bp.reset();
        this.cp.reset();
        this.xf.reset();
        this.vtxBuf.clear();
        this.program.use();
        this.gl.uniform1i(this.programInfo.uniforms.useId, 0);
        this.gl.uniform1i(this.programInfo.uniforms.useLights,
            this.context.lights.enabled ? 1 : 0);
        this.gl.uniform1i(this.programInfo.uniforms.useTexture,
            this.context.enableTextures ? 1 : 0);

        this.alphaComp0 = GX.Compare.GREATER;
        this.alphaRef0  = 0;
        this.alphaOp    = GX.AlphaOp.AND;
        this.alphaComp1 = GX.Compare.GREATER;
        this.alphaRef1  = 0;
    }

    async loadPrograms() {
        /** Download and set up the shader programs. */
        const gl = this.gl;

        //get shader code and create program
        const path = '/r/js/app/ui/gl/gx';
        this.program = new Program(this.context, {
            [gl.VERTEX_SHADER]:   (await get(`${path}/vertex.glsl`))  .responseText,
            [gl.FRAGMENT_SHADER]: (await get(`${path}/fragment.glsl`)).responseText,
        });
        CHECK_ERROR(gl);

        //get program info, used to set variables
        const getAttr = (name) => {
            const r = this.program.getAttribLocation(name);
            //console.assert(r);
            return r;
        };
        const getUni = (name) => {
            const r = this.program.getUniformLocation(name);
            //console.assert(r);
            return r;
        };
        this.programInfo = {
            program: this.program,
            attribs: {
                POS:      getAttr('in_POS'),
                NRM:      getAttr('in_NRM'),
                COL0:     getAttr('in_COL0'),
                TEX0:     getAttr('in_TEX0'),
                PNMTXIDX: getAttr('in_PNMTXIDX'),
                //T0MIDX:   getAttr('in_T0MIDX'),
                id:       getAttr('in_ID'),
            },
            uniforms: {
                matProjection: getUni('u_matProjection'),
                matModelView:  getUni('u_matModelView'),
                matNormal:     getUni('u_matNormal'),
                useId:         getUni('u_useId'),
                useTexture:    getUni('u_useTexture'),
                useAlphaTest:  getUni('u_useAlphaTest'),
                ambLightColor: getUni('u_ambLightColor'),
                dirLightColor: getUni('u_dirLightColor'),
                dirLightVector:getUni('u_dirLightVector'),
                matPos:        getUni('u_matPos'),
                matNrm:        getUni('u_matNrm'),
                matTex:        getUni('u_matTex'),
                uSampler: [
                    getUni('u_texture0'),
                    getUni('u_texture1'),
                ],
                alphaComp0: getUni('u_alphaComp0'),
                alphaRef0:  getUni('u_alphaRef0'),
                alphaComp1: getUni('u_alphaComp1'),
                alphaRef1:  getUni('u_alphaRef1'),
                alphaOp:    getUni('u_alphaOp'),
            },
        };
        CHECK_ERROR(gl);
        console.log("GX loadPrograms OK");
    }

    beginRender(mtxs, isPicker=false) {
        /** Reset render state for new frame.
         *  @param {object} mtxs A dict of matrices to set.
         *  @param {bool} isPicker Whether we're rendering to the pick buffer.
         */
        const gl = this.gl;
        this._isDrawingForPicker = isPicker;

        //this.program.use();
        //const unif = this.programInfo.uniforms;
        //console.log("PROGRAM INFO", this.programInfo);
        this.syncSettings(mtxs);
        this.syncXF();
    }

    finishRender() {
        /** Finish rendering the scene. */
        //clear backbuffer's alpha so that it doesn't incorrectly
        //blend with the canvas itself.
        const gl = this.gl;
        gl.colorMask(false, false, false, true);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.colorMask(true, true, true, true);
    }

    syncSettings(mtxs) {
        /** Upload various render settings to the GPU. */
        const gl = this.gl;
        this.program.use();
        const unif = this.programInfo.uniforms;

        //reset lights to whatever the user set.
        gl.uniform3iv(unif.ambLightColor,
            this.context.lights.ambient.color);
        gl.uniform3iv(unif.dirLightColor,
            this.context.lights.directional.color);
        gl.uniform3fv(unif.dirLightVector,
            this.context.lights.directional.vector);

        gl.uniform1i(unif.useId, this._isDrawingForPicker ? 1 : 0);
        gl.uniform1i(unif.useLights,
            this.context.lights.enabled ? 1 : 0);
        gl.uniform1i(unif.useTexture,
            this.context.enableTextures ? 1 : 0);

        gl.uniform1i(unif.alphaComp0, this.alphaComp0);
        gl.uniform1f(unif.alphaRef0,  this.alphaRef0);
        gl.uniform1i(unif.alphaOp,    this.alphaOp);
        gl.uniform1i(unif.alphaComp1, this.alphaComp1);
        gl.uniform1f(unif.alphaRef1,  this.alphaRef1);

        if(mtxs) {
            gl.uniformMatrix4fv(unif.matProjection, false, mtxs.projection);
            gl.uniformMatrix4fv(unif.matModelView,  false, mtxs.modelView);
            gl.uniformMatrix4fv(unif.matNormal,     false, mtxs.normal);
        }
    }

    syncXF() {
        /** Upload the XF matrix data to the GPU. */
        //XXX optimize by not uploading it all every time
        const gl = this.gl;
        this.program.use();
        const unif = this.programInfo.uniforms;
        //console.log(" *** SYNC XF");
        gl.uniform4fv(unif.matPos, this.xf._reg, 0x000, 0x100);
        gl.uniform3fv(unif.matNrm, this.xf._reg, 0x400, 0x060);
        gl.uniform4fv(unif.matTex, this.xf._reg, 0x500, 0x100);
    }

    sync() {
        this.syncSettings();
        this.syncXF();
    }

    setModelViewMtx(mtx) {
        this.gl.uniformMatrix4fv(this.programInfo.uniforms.matModelView,
            false, mtx);
    }

    executeBatch(batch) {
        /** Execute render batch.
         *  @param {RenderBatch} batch Render batch to execute.
         */
        const stats = batch.execute(this.programInfo);
        for(let [k,v] of Object.entries(stats)) {
            if(this.context.stats[k] == undefined) {
                this.context.stats[k] = v;
            }
            else this.context.stats[k] += v;
        }
        const gb = this.context.stats.geomBounds;
        gb.xMin = Math.min(gb.xMin, batch.geomBounds.xMin);
        gb.xMax = Math.max(gb.xMax, batch.geomBounds.xMax);
        gb.yMin = Math.min(gb.yMin, batch.geomBounds.yMin);
        gb.yMax = Math.max(gb.yMax, batch.geomBounds.yMax);
        gb.zMin = Math.min(gb.zMin, batch.geomBounds.zMin);
        gb.zMax = Math.max(gb.zMax, batch.geomBounds.zMax);
    }

    resetPicker() {
        this.pickerObjs = [];
    }
    addPickerObj(obj) {
        this.pickerObjs.push(obj);
        return this.pickerObjs.length - 1;
    }
    getPickerObj(idx) {
        return this.pickerObjs[idx];
    }

    //XXX document this or something
    setShaderParams(cullMode, blendMode, sFactor, dFactor,
    logicOp, compareEnable, compareFunc, updateEnable, alphaTest) {
        const gl = this.gl;
        switch(cullMode) {
            case GX.CullMode.NONE:
                gl.disable(gl.CULL_FACE);
                break;
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
        this.setBlendMode(blendMode, sFactor, dFactor, logicOp);
        this.setZMode(compareEnable, compareFunc, updateEnable);
        this.setUseAlphaTest(alphaTest);
        this.syncSettings();
    }

    setBlendMode(blendMode, srcFactor, destFactor, logicOp) {
        /** Implement GC SDK's gxSetBlendMode().
         *  @param {BlendMode} blendMode blend mode.
         *  @param {BlendFactor} srcFactor source blend factor.
         *  @param {BlendFactor} destFactor destination blend factor.
         *  @param {LogicOp} logicOp how to blend.
         */
        if(this._isDrawingForPicker) return;
        const gl = this.gl;
        gl.blendFunc(this.BlendFactorMap[srcFactor],
            this.BlendFactorMap[destFactor]);
        switch(blendMode) {
            case GX.BlendMode.NONE:
                gl.disable(gl.BLEND);
                break;
            case GX.BlendMode.BLEND:
                gl.enable(gl.BLEND);
                gl.blendEquation(gl.FUNC_ADD);
                break;
            case GX.BlendMode.LOGIC:
                gl.enable(gl.BLEND);
                //XXX bizarrely, fragment shaders can't read from the frame
                //buffer they're about to modify, so we can't implement
                //the various logic blend modes correctly.
                //for now we'll use this as a placeholder. should investigate
                //how Dolphin manages this. (probably glLogicOp)
                gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
                break;
            case GX.BlendMode.SUBTRACT:
                gl.enable(gl.BLEND);
                gl.blendEquation(gl.FUNC_SUBTRACT);
                break;
            default: throw new Error("Invalid blend mode");
        }
        this.syncSettings();
    }

    setZMode(compareEnable, compareFunc, updateEnable) {
        /** Implement GC SDK's gxSetZMode().
         *  @param {bool} compareEnable Whether to use depth compare.
         *  @param {GXCompare} compareFunc Compare function to use.
         *  @param {bool} updateEnable Whether to update Z buffer.
         */
        const gl = this.gl;
        if(compareEnable) gl.enable(gl.DEPTH_TEST);
        else gl.disable(gl.DEPTH_TEST);
        gl.depthFunc(this.CompareModeMap[compareFunc]);
        gl.depthMask(updateEnable);
    }

    setAlphaCompare(comp0, ref0, op, comp1, ref1) {
        //console.log("setAlphaCompare", comp0, ref0, op, comp1, ref1);
        //if(ref0 == 4 || ref0 == 7) debugger;
        this.alphaComp0 = comp0;
        this.alphaRef0  = ref0 / 255.0;
        this.alphaOp    = op;
        this.alphaComp1 = comp1;
        this.alphaRef1  = ref1 / 255.0;
        this.syncSettings();
    }

    setZCompLoc(loc) {
        //Z compare location = loc ? before tex : after tex
        //XXX
        console.warn("Not implemented: GX.setZCompLoc");
    }

    setChanCtrl(chan, enable, amb_src, mat_src, light_mask, diff_fn, attn_fn) {
        /**
        * @param {ChannelID} chan
        * @param {Bool}      enable
        * @param {ColorSrc}  amb_src
        * @param {ColorSrc}  mat_src
        * @param {u32}       light_mask
        * @param {DiffuseFn} diff_fn
        * @param {AttnFn}    attn_fn
        */
       //XXX
       //this is about lights, don't care right now
       console.warn("Not implemented: GX.setChanCtrl");
    }

    setCullMode(mode) {
        const gl = this.gl;
        switch(mode) {
            case GX.CullMode.NONE:
                gl.disable(gl.CULL_FACE);
                break;
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
    }

    setUseAlphaTest(enable) {
        //XXX find the corresponding SDK method
        this.gl.uniform1i(this.programInfo.uniforms.useAlphaTest,
            enable ? 1 : 0);
    }

    disableTextures(blendMode=GX.BlendMode.BLEND, cull=true) {
        /** Disable textures and change blending and culling params.
         *  Used for various non-textured rendering such as collision meshes.
         *  @param {GX.BlendMode} blendMode Which blending mode to use.
         *  @param {bool} cull Whether to use backface culling.
         */
        const gl = this.gl;
        this.setBlendMode(blendMode, GX.BlendFactor.SRCALPHA,
            GX.BlendFactor.INVSRCALPHA, GX.LogicOp.NOOP);
        if(cull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
        for(let i=0; i<this.MAX_TEXTURES; i++) {
            gl.activeTexture(gl.TEXTURE0 + i);
            this.whiteTexture.bind();
            gl.uniform1i(this.programInfo.uniforms.uSampler[i], i);
        }
    }

    _setShaderMtxs() {
        /** Send the current projection, modelview, and normal matrices
         *  to the shaders.
         */
        const gl = this.gl;
        gl.uniformMatrix4fv(this.programInfo.uniforms.matProjection,
            false, this.context.matProjection);
        gl.uniformMatrix4fv(this.programInfo.uniforms.matModelView,
            false, this.context.matModelView);
        gl.uniformMatrix4fv(this.programInfo.uniforms.matNormal,
            false, this.context.matNormal);
        //console.log("mtxs: proj", this.context.matProjection,
        //    "modelview", this.context.matNormal,
        //    "normal", this.context.matNormal);
    }
}
