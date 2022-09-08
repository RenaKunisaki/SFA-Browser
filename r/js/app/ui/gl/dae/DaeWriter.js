import { createElement, E } from "../../../../lib/Element.js";

const NS = {
    dae:   'http://www.collada.org/2005/11/COLLADASchema',
    html:  'http://www.w3.org/1999/xhtml',
    svg:   'http://www.w3.org/2000/svg',
    xlink: 'http://www.w3.org/1999/xlink',
    xml:   'http://www.w3.org/XML/1998/namespace',
    xmlns: 'http://www.w3.org/2000/xmlns/',
};
const GL = WebGL2RenderingContext;

export default class DaeWriter {
    /** Writes DAE files. */
    constructor() {
        this.cameras       = {}; //library_cameras
        this.lights        = {}; //library_lights
        this.effects       = {}; //library_effects
        this.images        = {}; //library_images
        this.materials     = {}; //library_materials
        this.geometries    = {}; //library_geometries
        this.visual_scenes = {}; //library_visual_scenes
        this.upAxis        = 'Y_UP';
        this.unit          = {
            name: 'centimetre',
            meter: 0.01, //this many metres to one unit
        };
        this.geomMtxs = {}; //XXX ugly hack
    }

    addBuffer(name, data, nVtxs, id, params) {
        //I'm not sure what the accessor's count is, but
        //I think it's the number of items, which should
        //just be the nunber of vertices.
        const accessor = createElement('accessor',
            null, {
                source: `#${id}.${name}.array`,
                count:  nVtxs,
                stride: params.length,
            },
        );
        for(let param of params) {
            const p = createElement('param', param);
            accessor.append(p);
        }

        //the array's count is just how many items it has.
        //it doesn't have a stride.
        return createElement('source',
            {id:`${id}.${name}`},
            createElement('float_array', null, {
                    id:    `${id}.${name}.array`,
                    count: data.length,
                },
                data.join(' ')
            ),
            createElement('technique_common', null,
                accessor,
            ),
        );
    }

    addGeometry(id, geom, mtx=null) {
        /** Add a geometry mesh.
         *  @param {string} id The mesh ID.
         *  @param {Element} geom A 'mesh' XML element.
         *  @param {mat4} mtx The transformation matrix.
         */
        this.geometries[id] = geom;
        this.geomMtxs[id] = mtx;
    }

    toXml() {
        this.xml = document.implementation.createDocument(NS.dae, "COLLADA");
        this.xml.documentElement.setAttribute('version', "1.4.1");
        this.xml.documentElement.setAttributeNS(NS.xmlns, 'xmlns:xsi',
            "http://www.w3.org/2001/XMLSchema-instance");

        const eAsset = E.asset(
            E.up_axis(null, this.upAxis),
            E.unit(null, this.unit),
        );
        this.xml.documentElement.append(eAsset);

        const scene = createElement('visual_scene',
            {id:'Scene', name:'Scene'});

        //this.xml.documentElement.appendChild(E.library_cameras(this.cameras));
        //this.xml.documentElement.appendChild(E.library_lights(this.lights));
        //this.xml.documentElement.appendChild(E.library_effects(this.effects));
        //this.xml.documentElement.appendChild(E.library_images(this.images));
        //this.xml.documentElement.appendChild(E.library_materials(this.materials));

        const eGeometries = createElement('library_geometries');
        for(const [id, geom] of Object.entries(this.geometries)) {
            eGeometries.append(createElement('geometry', {
                id:   id+'.geometry',
                name: id,
            }, geom));

            let mtx = this.geomMtxs[id];
            if(mtx) mtx = mtx.join(' ');
            else mtx = "1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1";

            scene.append(createElement('node',
                {id:id, name:id, type:'NODE'},
                createElement('matrix', null,
                    {sid:'transform'}, mtx
                ),
                createElement('instance_geometry', null, {url:'#'+id+'.geometry'}),
                //XXX bind_material
            ));
        }
        this.xml.documentElement.appendChild(eGeometries);
        this.xml.documentElement.appendChild(
            createElement([NS.dae, 'library_visual_scenes'], scene));
        this.xml.documentElement.appendChild(E.scene(
            createElement([NS.dae, 'instance_visual_scene'],
                {url:'#Scene'}),
        ));

        return this.xml;
    }
}
