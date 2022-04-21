import VertexBuffer from './VertexBuffer.js';
//import BP from './BP.js';
import CP from './CP.js';
import XF from './XF.js';
import DlistParser from './DlistParser.js';
import Program from '../Program.js';
import Texture from '../Texture.js';
import {get} from '/r/js/Util.js';
import RenderBatch from './RenderBatch.js';

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

export default class GX {
    /** GameCube GPU simulator.
     *  While nowhere near precise enough to be considered an emulator, this
     *  class functions roughly the same as the real GX chip - give it arrays
     *  containing display list and vertex attribute data, set up the registers
     *  telling how the data is formatted, and it renders an image.
     */
    static BlendMode = {
        NONE:     0x0,
        BLEND:    0x1,
        LOGIC:    0x2,
        SUBTRACT: 0x3,
    };
    static BlendFactor = {
        ZERO:        0x0,
        ONE:         0x1,
        SRCCLR:      0x2,
        INVSRCCLR:   0x3,
        SRCALPHA:    0x4,
        INVSRCALPHA: 0x5,
        DSTALPHA:    0x6,
        INVDSTALPHA: 0x7,
    };
    static LogicOp = {
        CLEAR:   0x0,
        AND:     0x1,
        REVAND:  0x2,
        COPY:    0x3,
        INVAND:  0x4,
        NOOP:    0x5,
        XOR:     0x6,
        OR:      0x7,
        NOR:     0x8,
        EQUIV:   0x9,
        INV:     0xa,
        REVOR:   0xb,
        INVCOPY: 0xc,
        INVOR:   0xd,
        NAND:    0xe,
        SET:     0xf,
    };
    static CompareMode = {
        NEVER:   0x0,
        LESS:    0x1,
        EQUAL:   0x2,
        LEQUAL:  0x3,
        GREATER: 0x4,
        NEQUAL:  0x5,
        GEQUAL:  0x6,
        ALWAYS:  0x7,
    };

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
            [GX.CompareMode.NEVER]:   gl.NEVER,
            [GX.CompareMode.LESS]:    gl.LESS,
            [GX.CompareMode.EQUAL]:   gl.EQUAL,
            [GX.CompareMode.LEQUAL]:  gl.LEQUAL,
            [GX.CompareMode.GREATER]: gl.GREATER,
            [GX.CompareMode.NEQUAL]:  gl.NOTEQUAL,
            [GX.CompareMode.GEQUAL]:  gl.GEQUAL,
            [GX.CompareMode.ALWAYS]:  gl.ALWAYS,
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
        this.programInfo = {
            program: this.program,
            attribs: {
                POS:  this.program.getAttribLocation('in_POS'),
                COL0: this.program.getAttribLocation('in_COL0'),
                NRM:  this.program.getAttribLocation('in_NRM'),
                TEX0: this.program.getAttribLocation('in_TEX0'),
                id:   this.program.getAttribLocation('in_ID'),
            },
            uniforms: {
                matProjection: this.program.getUniformLocation('u_matProjection'),
                matModelView:  this.program.getUniformLocation('u_matModelView'),
                matNormal:     this.program.getUniformLocation('u_matNormal'),
                useId:         this.program.getUniformLocation('u_useId'),
                useTexture:    this.program.getUniformLocation('u_useTexture'),
                useAlphaTest:  this.program.getUniformLocation('u_useAlphaTest'),
                ambLightColor: this.program.getUniformLocation('u_ambLightColor'),
                dirLightColor: this.program.getUniformLocation('u_dirLightColor'),
                dirLightVector:this.program.getUniformLocation('u_dirLightVector'),
                uSampler: [
                    this.program.getUniformLocation('u_texture0'),
                    this.program.getUniformLocation('u_texture1'),
                ],
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

        this.program.use();
        //reset lights to whatever the user set.
        gl.uniform3iv(this.programInfo.uniforms.ambLightColor,
            this.context.lights.ambient.color);
        gl.uniform3iv(this.programInfo.uniforms.dirLightColor,
            this.context.lights.directional.color);
        gl.uniform3fv(this.programInfo.uniforms.dirLightVector,
            this.context.lights.directional.vector);

        gl.uniform1i(this.programInfo.uniforms.useId,
            isPicker ? 1 : 0);
        gl.uniform1i(this.programInfo.uniforms.useLights,
            this.context.lights.enabled ? 1 : 0);
        gl.uniform1i(this.programInfo.uniforms.useTexture,
            this.context.enableTextures ? 1 : 0);

        const unif = this.programInfo.uniforms;
        gl.uniformMatrix4fv(unif.matProjection, false, mtxs.projection);
        gl.uniformMatrix4fv(unif.matModelView,  false, mtxs.modelView);
        gl.uniformMatrix4fv(unif.matNormal,     false, mtxs.normal);
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
    }

    setZMode(compareEnable, compareFunc, updateEnable) {
        /** Implement GC SDK's gxSetZMode().
         *  @param {bool} compareEnable Whether to use depth compare.
         *  @param {GXCompare} compareFunc Compare function to use.
         *  @param {bool} updateEnable Whether to update Z buffer.
         */
        const gl = this.gl;
        if(compareEnable) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
        gl.depthFunc(this.CompareModeMap[compareFunc]);
        gl.depthMask(updateEnable);
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
