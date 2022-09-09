import { createElement, E } from "../../../../lib/Element.js";

export const NS = {
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
        this.geomMats = {}; //materials
    }

    addBuffer(name, data, nVtxs, id, params) {
        //I'm not sure what the accessor's count is, but
        //I think it's the number of items, which should
        //just be the nunber of vertices.
        const accessor = createElement([NS.dae, 'accessor'],
            null, {
                source: `#${id}.${name}.array`,
                count:  nVtxs,
                stride: params.length,
            },
        );
        for(let param of params) {
            const p = createElement([NS.dae, 'param'], param);
            accessor.append(p);
        }

        //the array's count is just how many items it has.
        //it doesn't have a stride.
        return createElement([NS.dae, 'source'],
            {id:`${id}.${name}`},
            createElement([NS.dae, 'float_array'], null, {
                    id:    `${id}.${name}.array`,
                    count: data.length,
                },
                data.join(' ')
            ),
            createElement([NS.dae, 'technique_common'], null,
                accessor,
            ),
        );
    }

    addGeometry(id, buffers, mtx=null, materials=null) {
        /** Add a geometry mesh.
         *  @param {string} id The mesh ID.
         *  @param {Object} buffers The attribute buffers.
         *  @param {mat4} mtx The transformation matrix.
         *  @param {Array} material The material IDs.
         *  @returns {Element} The mesh element.
         */
        //create the vertices array
        const eVtxs = createElement([NS.dae, 'vertices'], null, {id:`${id}.vertices`},
            createElement([NS.dae, 'input'], null, {
                semantic:'POSITION',
                source:`#${id}.POSITION`,
            }),
        );

        //create the mesh
        const eMesh = createElement([NS.dae, 'mesh'], null, {id:id});
        for(const [name, buf] of Object.entries(buffers)) {
            eMesh.append(buf.elem);
        }
        eMesh.append(eVtxs);
        this.geometries[id] = eMesh;
        this.geomMtxs[id] = mtx;
        this.geomMats[id] = materials;
        return eMesh;
    }

    addEffect(id, images) {
        /** Add an Effect.
         *  @param {string} id The effect ID.
         *  @param {Array} images The image IDs.
         */
        const eProfile = createElement([NS.dae, 'profile_COMMON']);
        const eDiffuse = createElement([NS.dae, 'diffuse'], );
        for(const img of images) {
            eProfile.append(
                createElement([NS.dae, 'newparam'], {sid:`${img}.surface`},
                    createElement([NS.dae, 'surface'], {type:'2D'},
                        createElement([NS.dae, 'init_from'], null, img)
                    ),
                ),
                createElement([NS.dae, 'newparam'], {sid:`${img}.sampler`},
                    createElement([NS.dae, 'sampler2D'],
                        createElement([NS.dae, 'source'], null, `${img}.surface`)
                    ),
                ),
            );
            eDiffuse.append(createElement([NS.dae, 'texture'], {
                texture: `${img}.sampler`,
                texcoord: `${img}.uvmap`,
            }));
            break; //XXX how to handle multiple textures?
        }
        eProfile.append(
            createElement([NS.dae, 'technique'], {sid:'common'},
                createElement([NS.dae, 'lambert'],
                    createElement([NS.dae, 'emission'],
                        createElement([NS.dae, 'color'], null, {sid:'emission'},
                            '0 0 0 1'),
                    ),
                    eDiffuse,
                    createElement([NS.dae, 'index_of_refraction'],
                        createElement([NS.dae, 'float'], null, {sid:'ior'}, 1.45),
                    ),
                ),
            ),
        );
        this.effects[id] = createElement([NS.dae, 'effect'], {id:`${id}.effect`},
            eProfile);
        this.materials[id] = createElement([NS.dae, 'material'], {
            id: `${id}.material`,
            name: id,
        }, createElement([NS.dae, 'instance_effect'], {url:`#${id}.effect`}));
    }

    addImage(id, path) {
        /** Add a texture image.
         *  @param {string} id The image ID.
         *  @param {string} path The image URI.
         */
        this.images[id] = createElement([NS.dae, 'image'], {
            id: id,
            name: id,
        }, createElement([NS.dae, 'init_from'], null, path));

        return this.images[id];
    }

    _makeLibraryEffects() {
        const eFx = createElement([NS.dae, 'library_effects'], );
        for(const [id, fx] of Object.entries(this.effects)) {
            eFx.append(fx);
        }
        this.xml.documentElement.appendChild(eFx);
    }
    _makeLibraryImages() {
        const eImg = createElement([NS.dae, 'library_images'], );
        for(const [id, img] of Object.entries(this.images)) {
            eImg.append(img);
        }
        this.xml.documentElement.appendChild(eImg);
    }
    _makeLibraryMaterials() {
        const eMat = createElement([NS.dae, 'library_materials'], );
        for(const [id, mat] of Object.entries(this.materials)) {
            eMat.append(mat);
        }
        this.xml.documentElement.appendChild(eMat);
    }

    toXml() {
        this.xml = document.implementation.createDocument(NS.dae, "COLLADA");
        this.xml.documentElement.setAttribute('version', "1.4.1");
        this.xml.documentElement.setAttributeNS(NS.xmlns, 'xmlns:xsi',
            "http://www.w3.org/2001/XMLSchema-instance");

        const eAsset = createElement([NS.dae, 'asset'],
            createElement([NS.dae, 'up_axis'], null, this.upAxis),
            createElement([NS.dae, 'unit'], null, this.unit),
        );
        this.xml.documentElement.append(eAsset);

        const scene = createElement([NS.dae, 'visual_scene'], {id:'Scene', name:'Scene'});
        //this.xml.documentElement.appendChild(createElement([NS.dae, 'library_cameras'], this.cameras));
        //this.xml.documentElement.appendChild(createElement([NS.dae, 'library_lights'], this.lights));
        this._makeLibraryEffects();
        this._makeLibraryImages();
        this._makeLibraryMaterials();

        const eGeometries = createElement([NS.dae, 'library_geometries'], );
        for(const [id, geom] of Object.entries(this.geometries)) {
            eGeometries.append(createElement([NS.dae, 'geometry'], {
                id:   id+'.geometry',
                name: id,
            }, geom));

            let mtx = this.geomMtxs[id];
            if(mtx) mtx = mtx.join(' ');
            else mtx = "1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1";

            const eInst = createElement([NS.dae, 'instance_geometry'], null, {url:'#'+id+'.geometry'});
            let   mats  = this.geomMats[id];
            if(mats == null) mats = [];
            for(const mat of mats) {
                eInst.append(createElement([NS.dae, 'bind_material'],
                    createElement([NS.dae, 'technique_common'],
                        createElement([NS.dae, 'instance_material'],
                            {symbol:mat, target:`#${mat}.material`},
                            createElement([NS.dae, 'bind_vertex_input'], {
                                semantic: `${mat}.uvmap`,
                                input_semantic: 'TEXCOORD',
                                input_set: 0, //which texture
                            }),
                        ),
                    ),
                ));
            }

            scene.append(createElement([NS.dae, 'node'],
                {id:id, name:id, type:'NODE'},
                createElement([NS.dae, 'matrix'], null,
                    {sid:'transform'}, mtx
                ),
                eInst,
            ));
        }
        this.xml.documentElement.appendChild(eGeometries);
        this.xml.documentElement.appendChild(
            createElement([NS.dae, 'library_visual_scenes'], scene));
        this.xml.documentElement.appendChild(createElement([NS.dae, 'scene'],
            createElement([NS.dae, 'instance_visual_scene'],
                {url:'#Scene'}),
        ));

        return this.xml;
    }
}
