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
     *  Normally, one batch is generated by parsing a display list,
     *  and can be called to render that list; then, another batch
     *  is created wrapping all of a model's display lists.
     */
    constructor(gx) {
        this.gx      = gx;
        this.gl      = gx.gl;
        this.ops     = []; //array of either function or [mode, idx, count]
        this._idxs   = []; //index buffer data
        this.data    = {};
        this.buffers = {}; //GL buffer objects
        this.geomBounds = {
            x: [999999, -999999], //[min, max]
            y: [999999, -999999],
            z: [999999, -999999],
        };
        this._isFinished = false;
        for(const field of VAT_FIELD_ORDER) {
            this.data[field] = [];
            this.buffers[field] = this.gl.createBuffer();
        }
        this._idxBufObj = this.gl.createBuffer();
    }

    execute(programInfo, _depth=0) {
        /** Execute the batch operation.
         *  @param {object} programInfo A dict of the shader program's
         *    uniform and attribute objects.
         */
        const gl = this.gl;
        CHECK_ERROR(gl);
        if(!this._isFinished) this._finish(programInfo);
        console.assert(_depth < 10);

        const stats = {
            nOps:   0, //total operations
            nVtxs:  0, //total vertices drawn
            nPolys: 0, //total polygons drawn
        };

        //set the matrices and attribute buffers
        this._bindBuffers(programInfo);

        //execute the operations
        for(let cmd of this.ops) {
            stats.nOps++;
            if(typeof(cmd) == 'function') cmd();
            //we merge recursive batches, so this shouldn't happen.
            /* else if(cmd instanceof RenderBatch) {
                let stats2 = cmd.execute(programInfo, _depth+1);
                for(const [k,v] of Object.entries(stats2)) {
                    stats[k] += v;
                }
            } */
            else this._doDrawOp(cmd, stats);
            CHECK_ERROR(gl);
        }
        return stats;
    }

    _finish(programInfo) {
        /** Convert the data buffers to typed arrays and
         *  upload them to GL.
         *  @note After this, no more operations can be added.
         *   This is done automatically the first time the
         *   batch is executed.
         */
        if(this._isFinished) return;

        //convert data buffers
        const result = {};
        for(const [field, data] of Object.entries(this.data)) {
            if(field.endsWith('IDX')) result[field] = Int32Array.from(data);
            else result[field] = Float32Array.from(data);
        }
        this.data = result;

        //build vtx index buffer
        console.assert(this._idxs.length < 65536);
        this._idxBuf = new Uint16Array(this._idxs);
        this._isFinished = true;

        this._uploadBuffers(programInfo);
    }

    addFunction(func) {
        /** Add a function to this batch.
         *  @param {function,RenderBatch} func Function to call.
         *  @note The function will be called (with no arguments) at the
         *   point it's inserted, whenever the batch is executed.
         */
        if(func instanceof RenderBatch) {
            //merge into this one, to avoid excess buffer operations
            //during rendering.
            const startIdx = this._idxs.length;
            for(const idx of func._idxs) {
                this._idxs.push(idx+startIdx);
            }
            for(const [field, data] of Object.entries(func.data)) {
                this.data[field] = this.data[field].concat(data);
            }
            for(const op of func.ops) {
                if(Array.isArray(op)) {
                    const [mode, index, count] = op;
                    this.ops.push([mode, index+startIdx, count]);
                }
                else this.addFunction(op);
            }
            this.geomBounds.x[0] = Math.min(this.geomBounds.x[0], func.geomBounds.x[0]);
            this.geomBounds.x[1] = Math.max(this.geomBounds.x[1], func.geomBounds.x[1]);
            this.geomBounds.y[0] = Math.min(this.geomBounds.y[0], func.geomBounds.y[0]);
            this.geomBounds.y[1] = Math.max(this.geomBounds.y[1], func.geomBounds.y[1]);
            this.geomBounds.z[0] = Math.min(this.geomBounds.z[0], func.geomBounds.z[0]);
            this.geomBounds.z[1] = Math.max(this.geomBounds.z[1], func.geomBounds.z[1]);
        }
        else this.ops.push(func);
    }

    addVertices(drawMode, ...vtxs) {
        /** Add a polygon to this batch.
         *  @param {integer} drawMode Which GL drawing mode to use.
         *  @param {object} vtxs Vertices to draw.
         */
        console.assert(!this._isFinished);
        const poly = [drawMode, this._idxs.length, vtxs.length]; //mode, idx, count
        for(const vtx of vtxs) {
            //since buffers are normalized/padded, all indices are the same
            //for all attributes. we use POS because it has to be present.
            this._idxs.push(this.data.POS.length / 3); //POS is 3 entries per vtx
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
        this.geomBounds.x[0] = Math.min(this.geomBounds.x[0], vtx.POS[0]);
        this.geomBounds.x[1] = Math.max(this.geomBounds.x[1], vtx.POS[0]);
        this.geomBounds.y[0] = Math.min(this.geomBounds.y[0], vtx.POS[1]);
        this.geomBounds.y[1] = Math.max(this.geomBounds.y[1], vtx.POS[1]);
        this.geomBounds.z[0] = Math.min(this.geomBounds.z[0], vtx.POS[2]);
        this.geomBounds.z[1] = Math.max(this.geomBounds.z[1], vtx.POS[2]);
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

    _uploadBuffers(programInfo) {
        /** Upload the attribute/index buffer data
         *  to the given program.
         */
        const gl = this.gl;
        console.log("uploading buffer data");

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
            CHECK_ERROR(gl);
        }

        //vertex index buffer
        //the way this is currently implemented, the indices are
        //always N, N+1, N+2... so we could use gl.drawArrays()
        //instead. however I might change this in the future.
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._idxBufObj);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._idxBuf, gl.STATIC_DRAW);
        CHECK_ERROR(gl);
    }

    _bindBuffers(programInfo) {
        /** Bind the attribute/index buffers. */
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
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            const type = field.endsWith('IDX') ? gl.UNSIGNED_INT : gl.FLOAT;
            gl.vertexAttribPointer(attr,
                count,    //number of values per vertex
                type,     //data type in buffer
                false,    //don't normalize
                0,        //stride (0=use type and numComponents)
                0);       //offset in bytes to start from in buffer
            gl.enableVertexAttribArray(attr);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._idxBufObj);
    }

    _doDrawOp(cmd, stats) {
        /** Execute a draw operation.
         *  @param {Array} cmd Operation to execute: [mode, index, count]
         *  @param {object} stats Dict of stats to update.
         */
        const gl = this.gl;
        const [mode, index, count] = cmd;
        //index * sizeof(unsigned short)
        gl.drawElements(mode, count, gl.UNSIGNED_SHORT, index*2);
        //gl.drawArrays(cmd[0], cmd[1], cmd.length - 1);
        CHECK_ERROR(gl);
        stats.nPolys++;
        stats.nVtxs += cmd.length - 1;
        /* for future reference:
        "vertex buffer not big enough for draw call" means one of the
        indices in the buffer is beyond the number of items in the
        attribtue buffers.
        supposedly there's bugs in some platforms that cause this when
        using DYNAMIC_DRAW as well?
        "insufficient buffer size" means index and/or count exceed the
        number of elements in the index buffer.
        having nothing drawn might mean all zeroes were passed for colors
        and blending is enabled (everything is invisible), or that your
        viewport's size is zero because you didn't wait for the canvas
        to be actually laid out and given a size before reading its size,
        or that culling and/or depth testing are hiding everything.
        */
    }
}
