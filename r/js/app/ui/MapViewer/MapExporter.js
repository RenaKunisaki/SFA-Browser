import DaeWriter from "../gl/dae/DaeWriter.js";
import { downloadXml } from "../../../Util.js";
import { createElement, E } from "../../../lib/Element.js";
import BlockRenderer from "./BlockRenderer.js";
import RenderBatch from "../gl/gx/RenderBatch.js";
import RenderStreamParser from "../../../game/model/RenderStreamParser.js";
import BitStreamReader from "../../../game/BitStreamReader.js";
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
            this._blockToGeometry(block);
        }

        //XXX prettyXml() doesn't work with DAE?
        downloadXml(this.writer.toXml(), 'map.dae',
            'model/vnd.collada+xml', false);
    }

    _blockToGeometry(block) {
        const gl = this.gx.gl;
        const id = block.header.name;
        console.assert(id != undefined);

        //create the buffers
        const buffers = {
            positions: {
                data: [],
                params: [
                    {name:'X', type:'float'},
                    {name:'Y', type:'float'},
                    {name:'Z', type:'float'},
                ],
            },
            //using the Array types here doesn't work because
            //it uses the host's byte order
            //colors: { //XXX need to convert to some other format?
            //    data: new Uint16Array(block.vtxColors),
            //    stride: 1,
            //},
            //texCoords: {
            //    data: new Int16Array(block.texCoords),
            //    stride: 2,
            //},
        };
        let view = new DataView(block.vtxPositions);
        for(let i=0; i<block.header.nVtxs*3; i++) {
            buffers.positions.data.push(view.getInt16(i*2));
        }

        for(const [name, buf] of Object.entries(buffers)) {
            buf.elem = this.writer.addBuffer(name,
                buf.data, block.header.nVtxs, id, buf.params);
        }

        //create the vertices array
        const eVtxs = E.vertices(null, {id:`${id}.vertices`},
            E.input(null, {semantic:'POSITION', source:`#${id}.positions`}),
            //these apparently need to be under each draw op, not here...
            //E.input(null, {semantic:'TEXCOORD', source:`#${id}.texCoords`}),
            ////XXX I don't see a COLOR semantic in DAE manual?
            //E.input(null, {semantic:'COLOR', source:`#${id}.colors`}),
        );

        //create the mesh
        //should probably be a method of writer but would require
        //us to standardize the names so it knows which buffer
        //needs which semantic
        const eMesh = E.mesh(null, {id:id});
        for(const [name, buf] of Object.entries(buffers)) {
            eMesh.append(buf.elem);
        }
        eMesh.append(eVtxs);

        //parse the block
        const streams = ['main', 'reflective', 'water'];
        for(const name of streams) {
            const stream = new RenderStreamParser(this.gx);
            const reader = new BitStreamReader(
                block.renderInstrs[name]);
            const batch = stream.execute(block, reader, {
                isMap: true,
            });
            this._parseRenderBatch(eMesh, batch, id);
        }
        this.writer.addGeometry(id, eMesh);
    }

    _parseRenderBatch(eMesh, batch, id) {
        //this doesn't work because the batch only contains functions,
        //presumably because they call display lists.
        //we need to hook into GX for this...
        for(let op of batch.ops) {
            if(op instanceof RenderBatch) {
                this._parseRenderBatch(eMesh, op);
                continue;
            }
            else if(typeof(op) == 'function') continue;

            let name;
            const [mode, idx, count] = op;
            switch(mode) {
                case GL.TRIANGLES:      name = 'triangles'; break;
                case GL.TRIANGLE_FAN:   name = 'trifans'; break;
                case GL.TRIANGLE_STRIP: name = 'tristrips'; break;
                case GL.LINES:          name = 'lines'; break;
                case GL.LINE_STRIP:     name = 'linestrips'; break;
                default:
                    debugger;
                    throw new Error("Unsupported draw mode");
            }
            const idxs = batch._idxs.slice(idx, idx+count);
            const p = E.p(null, idxs.join(' '));
            const eOp = createElement(name, {count:count},
                E.input({
                    semantic: 'VERTEX',
                    source: `#${id}.vertices`,
                    offset: 0,
                }), p);
            eMesh.append(eOp);
        }
    }
}
