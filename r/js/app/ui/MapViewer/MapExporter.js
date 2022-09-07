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
        //name them the same as the 'semantic' value
        //for simplicity
        const buffers = {
            POSITION: {
                data: block.vtxPositions,
                count: block.header.nVtxs,
                //idx * sizeof(s16)
                //this is per value in the buffer so we
                //don't need to worry about X/Y/Z
                read: (view,idx) => view.getInt16(idx*2),
                params: [
                    {name:'X', type:'float'},
                    {name:'Y', type:'float'},
                    {name:'Z', type:'float'},
                ],
            },

            COLOR: {
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
                    {name:'R', type:'float'},
                    {name:'G', type:'float'},
                    {name:'B', type:'float'},
                    {name:'A', type:'float'},
                ],
            },

            TEXCOORD: {
                data: block.texCoords,
                count: block.header.nTexCoords,
                read: (view,idx) => view.getInt16(idx*2),
                params: [ //XXX verify name and type
                    {name:'R', type:'float'},
                    {name:'G', type:'float'},
                    {name:'B', type:'float'},
                    {name:'A', type:'float'},
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
                values, block.header.nVtxs, id, buf.params);
        }

        //create the vertices array
        const eVtxs = E.vertices(null, {id:`${id}.vertices`},
            E.input(null, {semantic:'POSITION', source:`#${id}.POSITION`}),
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
            this._parseRenderBatch(eMesh, batch, id, buffers);
        }
        this.writer.addGeometry(id, eMesh);
    }

    _parseRenderBatch(eMesh, batch, id, buffers) {
        for(let op of batch.ops) {
            if(op instanceof RenderBatch) {
                this._parseRenderBatch(eMesh, op, id, buffers);
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
            const idxBuf = [];
            const eOp = createElement(name, {count:count},
                E.input({
                    semantic: 'VERTEX',
                    source: `#${id}.vertices`,
                    offset: 0, //for each vertex there are some number
                        //of items in the index buffer; the 0th item
                        //is the position in this case.
                }));
            let offset=1;
            for(const [name, buf] of Object.entries(buffers)) {
                if(name == 'POSITION') continue;
                E.input({
                    semantic: name,
                    source: `#${id}.${name}`,
                    offset: offset++,
                });
            }

            //we (probably) have to have one index per attribute
            //in the index buffer, but, in the game, they're all
            //just the same value for every attribute.
            for(let i=0; i<count; i++) {
                for(let j=0; j<offset; j++) {
                    idxBuf.push(idxs[i]);
                }
            }

            //the index buffer itself
            eOp.append(E.p(null, idxBuf.join(' ')));
            eMesh.append(eOp);
        }
    }
}
