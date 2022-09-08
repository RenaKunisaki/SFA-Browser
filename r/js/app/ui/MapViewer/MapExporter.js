import DaeWriter from "../gl/dae/DaeWriter.js";
import { downloadXml } from "../../../Util.js";
import { createElement, E } from "../../../lib/Element.js";
import BlockRenderer from "./BlockRenderer.js";
import RenderBatch from "../gl/gx/RenderBatch.js";
import RenderStreamParser from "../../../game/model/RenderStreamParser.js";
import BitStreamReader from "../../../game/BitStreamReader.js";
import { MAP_CELL_SIZE } from "../../../game/Game.js";
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

    _makeBuffers(block) {
        //create the buffers
        //name them the same as the 'semantic' value
        //for simplicity
        const buffers = {
            POSITION: {
                attr: 'POS',
                data: block.vtxPositions,
                count: block.header.nVtxs * 3,
                //idx * sizeof(s16)
                //this is per value in the buffer so we
                //don't need to worry about X/Y/Z
                read: (view,idx) => view.getInt16(idx*2) / 8,
                params: [ //the names don't actually matter according to the spec
                    //but they do need to be unique, I assume
                    {name:'X', type:'float'},
                    {name:'Y', type:'float'},
                    {name:'Z', type:'float'},
                ],
            },

            COLOR: {
                attr: ['COL0', 'COL1'],
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
                attr: ['TEX0', 'TEX1', 'TEX2', 'TEX3',
                    'TEX4', 'TEX5', 'TEX6', 'TEX7'],
                data: block.texCoords,
                count: block.header.nTexCoords,
                read: (view,idx) => view.getInt16(idx*2),
                params: [ //XXX verify name and type
                    {name:'U', type:'float'},
                    {name:'V', type:'float'},
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
                values, block.header.nVtxs, block.header.name,
                buf.params);
        }
        return buffers;
    }

    _blockToGeometry(block) {
        const gl = this.gx.gl;
        const id = block.header.name;
        console.assert(id != undefined);

        const buffers = this._makeBuffers(block);

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
            stream.execute(block, reader, {
                isMap: true,
                vtxHandler: (mode, ...vtxs) => {
                    this._addVtxs(eMesh, id, buffers, mode, ...vtxs);
                },
            });
        }

        const tx  = block.x * MAP_CELL_SIZE;
        const ty  = block.header.yOffset;
        const tz  = block.z * MAP_CELL_SIZE;
        let   mtx = mat4.create();
        mat4.translate(mtx, mtx, vec3.fromValues(tx, ty, tz));
        mat4.transpose(mtx, mtx);
        this.writer.addGeometry(id, eMesh, mtx);
    }

    _triangulate(mode, ...vtxs) {
        //lol blender doesn't support any actual primitives
        //for DAE importing
        const result = [];

        switch(mode) {
            case GL.TRIANGLES:
                return vtxs;

            case GL.TRIANGLE_FAN: {
                for(let i=2; i<vtxs.length; i++) {
                    result.push(vtxs[0]);
                    result.push(vtxs[i-1]);
                    result.push(vtxs[i]);
                }
                return result;
            }

            case GL.TRIANGLE_STRIP: {
                for(let i=2; i<vtxs.length; i++) {
                    result.push(vtxs[i-2]);
                    result.push(vtxs[i-1]);
                    result.push(vtxs[i]);
                }
                return result;
            }

            case GL.LINES: //XXX
            case GL.LINE_STRIP:
            default:
                console.error("Unsupported primitive type", mode);
                throw new Error("Unsupported primitive type");

        }
    }

    _addVtxs(eMesh, id, buffers, mode, ...vtxs) {
        const tris  = this._triangulate(mode, ...vtxs);
        if(tris.length == 0) return;

        const count = tris.length / 3;
        const eOp   = createElement('triangles', {count:count});

        //build the index buffers
        const idxNames = [];
        let offset = 0;
        for(const [name, buf] of Object.entries(buffers)) {
            let sName = name;
            if(sName == 'POSITION') sName = 'VERTEX'; //lol
            let aNames = buf.attr;
            if(!Array.isArray(aNames)) aNames = [aNames];
            for(let item of aNames) {
                //ignore attrs we don't have
                if(tris[0][item+'_idx'] != null) {
                    eOp.append(E.input({
                        semantic: sName,
                        source: `#${id}.${name}`,
                        offset: offset++,
                    }));
                }
            }
            idxNames.push(name);
        }

        //populate the index buffers
        const idxs = [];
        for(const tri of tris) {
            for(const attr of idxNames) {
                const buf = buffers[attr];
                let aNames = buf.attr;
                if(!Array.isArray(aNames)) aNames = [aNames];
                for(const aName of aNames) {
                    let val = tri[aName+'_idx'];
                    if(val != null) idxs.push(val);
                }
            }
        }

        //the actual index list
        eOp.append(E.p(null, idxs.join(' ')));
        eMesh.append(eOp);
    }
}
