import { VAT_FIELD_ORDER } from './GX.js';

const AttrCounts = { //number of elements expected per attribute
    PNMTXIDX: 1,
    T0MIDX:1, T1MIDX:1, T2MIDX:1, T3MIDX:1,
    T4MIDX:1, T5MIDX:1, T6MIDX:1, T7MIDX:1,
    POS:   3, NRM:   3, COL0:  4, COL1:  4,
    TEX0:  2, TEX1:  2, TEX2:  2, TEX3:  2,
    TEX4:  2, TEX5:  2, TEX6:  2, TEX7:  2,
};
//XXX support 9-normals mode. WebGL doesn't allow more than 4
//values per vertex. probably we'd want to use three buffers
//for the 3 normal vectors.

function CHECK_ERROR(gl) {
    let err = gl.getError();
    console.assert(!err);
}

export default class RenderBatch {
    /** A collection of render operations and data, that
     *  can be executed to render a complex model.
     */
    constructor(gx) {
        this.gx = gx;
        this.gl = gx.gl;
        this.ops = [];
        this._isFinished = false;
        this._maxVtxs = 0; //most vtxs in one call
        this.data = {};
        this.buffers = {}; //GL buffer objects
        for(const field of VAT_FIELD_ORDER) {
            this.data[field] = [];
            this.buffers[field] = this.gl.createBuffer();
        }
        this._idxBufObj = this.gl.createBuffer();
        //this._vao = this.gl.createVertexArray();
    }

    execute(programInfo, mtxs) {
        /** Execute the batch operation.
         *  @param {object} programInfo A dict of the shader program's
         *    uniform and attribute objects.
         *  @param {object} mtxs A dict of matrices to set.
         */
        const gl = this.gl;
        CHECK_ERROR(gl);
        if(!this._isFinished) this.finish();

        const stats = {
            nOps:   0, //total operations
            nVtxs:  0, //total vertices drawn
            nPolys: 0, //total polygons drawn
        };

        //set the matrices and attribute buffers
        const unif = programInfo.uniforms;
        gl.uniformMatrix4fv(unif.matProjection, false, mtxs.projection);
        gl.uniformMatrix4fv(unif.matModelView,  false, mtxs.modelView);
        gl.uniformMatrix4fv(unif.matNormal,     false, mtxs.normal);
        CHECK_ERROR(gl);
        this._bindAttrBuffers(programInfo);

        //execute the operations
        for(let cmd of this.ops) {
            stats.nOps++;
            //console.log("exec batch op", cmd);
            if(typeof(cmd) == 'function') cmd();
            else if(cmd instanceof RenderBatch) {
                let stats2 = cmd.execute(programInfo, mtxs);
                for(const [k,v] of Object.entries(stats2)) {
                    stats[k] += v;
                }
            }
            else this._doDrawOp(cmd, stats);
            CHECK_ERROR(gl);
        }
        return stats;
    }

    finish() {
        /** Convert the data buffers to typed arrays. */
        if(this._isFinished) return;

        //convert data buffers
        const result = {};
        for(const [field, data] of Object.entries(this.data)) {
            if(field.endsWith('IDX')) result[field] = Int32Array.from(data);
            else result[field] = Float32Array.from(data);
        }
        this.data = result;

        //build vtx index buffer
        console.assert(this._maxVtxs < 65536);
        this._idxBuf = new Uint16Array(this._maxVtxs);
        this._isFinished = true;
    }

    addFunction(func) {
        /** Add a function to this batch.
         *  @param {function,RenderBatch} func Function to call.
         *  @note The function will be called (with no arguments) at the
         *   point it's inserted, whenever the batch is executed.
         */
        this.ops.push(func);
    }

    addVertices(drawMode, ...vtxs) {
        /** Add a polygon to this batch.
         *  @param {integer} drawMode Which GL drawing mode to use.
         *  @param {object} vtxs Vertices to draw.
         */
        console.assert(!this._isFinished);
        this._maxVtxs = Math.max(this._maxVtxs, vtxs.length);
        const poly = [drawMode];
        for(const vtx of vtxs) {
            //since buffers are normalized/padded, all indices are the same
            //for all attributes. we use POS because it has to be present.
            poly.push(this.data.POS.length / 3); //POS is 3 entries per vtx
            this._storeVertex(vtx);
        }
        this.ops.push(poly);
    }

    _storeVertex(vtx) {
        /** Store one vertex to the data buffers.
         *  @param {object} vtx Vertex to store.
         *  @note Normalizes the attribute data to a consistent
         *   size and type and stores it in the buffers.
         */
        for(const field of VAT_FIELD_ORDER) {
            const count = AttrCounts[field];
            let val = vtx[field];
            if(count == 1 || val == null || val == undefined) val = [val];
            if(val.length > count) {
                console.warn("Too many values for attribute", field);
            }
            for(let i=0; i<count; i++) {
                let v = val[i];
                if(v == null || v == undefined) {
                    //paradoxically, the value NaN is, in fact, a "number",
                    //so it can be stored in a Float32Array.
                    if(field.endsWith('IDX')) v = -1;
                    else v = NaN;
                }
                this.data[field].push(v);
            }
        }
    }

    _bindAttrBuffers(programInfo) {
        const gl = this.gl;
        for(const [field, buf] of Object.entries(this.buffers)) {
            const count = AttrCounts[field];
            if(count == undefined) {
                //console.warn("No attrib count for", field);
                continue; //not an attribute
            }
            const attr = programInfo.attribs[field];
            if(attr == undefined) {
                //console.warn("No shader attrib found for", field);
                continue; //no such attribute in shader
            }
            const data = this.data[field];
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
            const type = field.endsWith('IDX') ? gl.UNSIGNED_INT : gl.FLOAT;
            //console.log("Bind attr", field, attr, data, "count", count, "type", type);
            gl.vertexAttribPointer(attr,
                count,    //number of values per vertex
                type,     //data type in buffer
                false,    //don't normalize
                0,        //stride (0=use type and numComponents)
                0);       //offset in bytes to start from in buffer
            gl.enableVertexAttribArray(attr);
            CHECK_ERROR(gl);
        }
    }

    _doDrawOp(cmd, stats) {
        const gl = this.gl;
        //the way this is currently implemented, the indices are
        //always N, N+1, N+2... so we could use gl.drawArrays()
        //instead. however I might change this in the future.
        for(let i=1; i<cmd.length; i++) {
            this._idxBuf[i-1] = cmd[i];
        }

        //debug
        /* const vals = {};
        for(const field of VAT_FIELD_ORDER) {
            const data = this.data[field];
            vals[field] = [];
            let count = AttrCounts[field];
            for(let i=1; i<cmd.length; i++) {
                for(let j=0; j<count; j++) {
                    vals[field].push(data[(cmd[i]*count)+j]);
                }
            }
        }
        console.log("render op", cmd, vals); */

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._idxBufObj);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._idxBuf, gl.STATIC_DRAW);
        //let size = gl.getBufferParameter(gl.ELEMENT_ARRAY_BUFFER, gl.BUFFER_SIZE);
        //we may be able to use bufferSubData() on subsequent calls
        //to improve performance.
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._idxBufObj);
        gl.drawElements(cmd[0], cmd.length-1, gl.UNSIGNED_SHORT, 0);
        //gl.drawArrays(cmd[0], cmd[1], cmd.length - 1);
        stats.nPolys++;
        stats.nVtxs += cmd.length - 1;
    }
}
