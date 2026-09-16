const GLB_MAGIC  = 0x46546C67; //"glTF"
const CHUNK_JSON = 0x4E4F534A; //"JSON"
const CHUNK_BIN  = 0x004E4942; //"BIN\0"

export const ComponentType = {
    UNSIGNED_BYTE:  5121,
    UNSIGNED_SHORT: 5123,
    UNSIGNED_INT:   5125,
    FLOAT:          5126,
};
export const Target = {
    ARRAY_BUFFER:         34962,
    ELEMENT_ARRAY_BUFFER: 34963,
};
const NUM_COMPONENTS = {SCALAR:1, VEC2:2, VEC3:3, VEC4:4};

/** Writes glTF 2.0 binary (.glb) files. */
export default class GlbWriter {
    constructor(generator='SFA-Browser') {
        this.json = {
            asset:       {version:'2.0', generator:generator},
            scene:       0,
            scenes:      [{nodes:[]}],
            nodes:       [],
            meshes:      [],
            materials:   [],
            textures:    [],
            images:      [],
            samplers:    [{magFilter:9729, minFilter:9987, //LINEAR, LINEAR_MIPMAP_LINEAR
                wrapS:10497, wrapT:10497}], //REPEAT
            accessors:   [],
            bufferViews: [],
            buffers:     [],
            extensionsUsed: [],
        };
        this._bin    = []; //parts of the binary chunk
        this._binLen = 0;
    }

    useExtension(name) {
        if(!this.json.extensionsUsed.includes(name)) {
            this.json.extensionsUsed.push(name);
        }
    }

    /** Append data to the binary chunk.
     *  @param {ArrayBuffer|TypedArray} data The data to append.
     *  @param {number} target The buffer target, if any.
     *  @returns {number} The buffer view index.
     */
    addBufferView(data, target=null) {
        if(data instanceof ArrayBuffer) data = new Uint8Array(data);
        else data = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const view = {buffer:0, byteOffset:this._binLen, byteLength:data.byteLength};
        if(target) view.target = target;
        this._bin.push(data);
        this._binLen += data.byteLength;
        const pad = (4 - (this._binLen & 3)) & 3; //views must be 4-byte aligned
        if(pad) {
            this._bin.push(new Uint8Array(pad));
            this._binLen += pad;
        }
        return this.json.bufferViews.push(view) - 1;
    }

    /** Add an accessor over a typed array.
     *  @param {TypedArray} data The data.
     *  @param {number} componentType The glTF component type.
     *  @param {string} type The element type (SCALAR, VEC3...).
     *  @param {number} target The buffer target, if any.
     *  @param {object} extra Additional accessor properties.
     *  @returns {number} The accessor index.
     */
    addAccessor(data, componentType, type, target=null, extra={}) {
        const accessor = {
            bufferView:    this.addBufferView(data, target),
            componentType: componentType,
            count:         data.length / NUM_COMPONENTS[type],
            type:          type,
            ...extra,
        };
        return this.json.accessors.push(accessor) - 1;
    }

    /** Add a PNG image and return its index. */
    addImage(png, name) {
        return this.json.images.push({
            name:       name,
            mimeType:   'image/png',
            bufferView: this.addBufferView(png),
        }) - 1;
    }

    /** Add a texture using the given image and return its index. */
    addTexture(image) {
        return this.json.textures.push({source:image, sampler:0}) - 1;
    }

    addMaterial(material) {
        return this.json.materials.push(material) - 1;
    }

    addMesh(name, primitives) {
        return this.json.meshes.push({name:name, primitives:primitives}) - 1;
    }

    /** Add a node to the scene, or as a child of another node.
     *  @param {object} node The node.
     *  @param {number} parent Index of the parent node, or null.
     *  @returns {number} The node index.
     */
    addNode(node, parent=null) {
        const idx = this.json.nodes.push(node) - 1;
        if(parent == null) this.json.scenes[0].nodes.push(idx);
        else {
            const p = this.json.nodes[parent];
            if(!p.children) p.children = [];
            p.children.push(idx);
        }
        return idx;
    }

    /** Build the .glb file.
     *  @returns {Blob} The file data.
     */
    toBlob() {
        this.json.buffers = [{byteLength:this._binLen}];
        const json    = new TextEncoder().encode(JSON.stringify(this.json));
        const jsonPad = (4 - (json.byteLength & 3)) & 3;
        const jsonLen = json.byteLength + jsonPad;

        const header = new DataView(new ArrayBuffer(20));
        header.setUint32( 0, GLB_MAGIC, true);
        header.setUint32( 4, 2, true); //version
        header.setUint32( 8, 20 + jsonLen + 8 + this._binLen, true);
        header.setUint32(12, jsonLen, true);
        header.setUint32(16, CHUNK_JSON, true);

        const binHeader = new DataView(new ArrayBuffer(8));
        binHeader.setUint32(0, this._binLen, true);
        binHeader.setUint32(4, CHUNK_BIN, true);

        return new Blob([header.buffer, json, ' '.repeat(jsonPad),
            binHeader.buffer, ...this._bin], {type:'model/gltf-binary'});
    }
}
