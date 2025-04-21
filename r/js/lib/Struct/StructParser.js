import { getXml, hex, int } from "../../Util.js";
import Struct from "./Struct.js";
import Field from "./Field.js";
import { EnumItem, Enum } from "./Enum.js";
import { types } from "./Type.js";
import Padding from "./Padding.js";

export default class StructParser {
    constructor() {
        this._parsedPaths = new Set();
        this._namespaceParents = new WeakMap(); //namespace => parent
        this._namespaceNames = new WeakMap(); //namespace => name
        this.types = this._newNamespace('root', null);
        for(let [name, tp] of Object.entries(types)) {
            this.types[name] = new tp();
        }

        //these are the same for several types,
        //so let's not duplicate them.
        this._defaultTagHandlers = {
            description: this._parseDescription,
            note: this._parseNote,
        };
    }

    _newNamespace(name, parent, contents={}) {
        const ns = Object.assign({}, contents);
        this._namespaceParents.set(ns, parent);
        this._namespaceNames  .set(ns, name);
        return ns;
    }

    /** Parse a 'description' element. */
    _parseDescription(obj, elem) {
        if(obj.description != null && obj.description != undefined) {
            throw new Error("Multiple 'description' elements");
        }
        obj.description = elem.textContent;
    }

    /** Parse a 'note' element. */
    _parseNote(obj, elem) {
        obj.notes.push(elem.textContent);
    }

    /** Parse a child node that can appear under many
     *  different parents.
     */
    _parseGenericTag(obj, elem) {
        if(elem.tagName == undefined) return; //text (whitespace, etc)
        else if(this._defaultTagHandlers[elem.tagName]) {
            this._defaultTagHandlers[elem.tagName](obj, elem);
        }
        else throw new TypeError(`Unexpected element: ${elem.tagName}`);
    }

    /** Parse the 'order' attribute of the given element,
     *  if it exists.
     *  @param {Element} elem The element to parse.
     *  @returns {bool} true if the byte order is little endian;
     *   false if big endian.
     */
    _getByteOrder(elem) {
        const order = elem.getAttribute('order');
        switch(order) {
            //default is same as JS' DataView methods (big endian)
            case undefined: case null: //default (fall thru)
            case '>': return false;
            case '<': return true;
            default: throw new Error(
                `Invalid value '${order}' for attribute 'order' in element '${elem.tagName}'`);
        }
    }

    /** Parse one 'item' element in an enum. */
    _parseEnumItem(eItem, namespace=null) {
        if(namespace == null) namespace = this.types;
        const result = {
            name:         eItem.getAttribute('name'),
            value:        int(eItem.getAttribute('value')),
            description:  null,
            notes:        [],
        };
        for(let child of eItem.childNodes) {
            this._parseGenericTag(result, child);
        }
        return new EnumItem(result);
    }

    /** Parse one 'enum' element. */
    parseEnum(eEnum, namespace=null) {
        if(namespace == null) namespace = this.types;
        const result = {
            name:         eEnum.getAttribute('name'),
            type:         types.int,
            fields:       {},
            fieldsByName: {},
            description:  null,
            notes:        [],
        };

        //get type
        let tName = eEnum.getAttribute('type');
        if(tName != null && tName != undefined) {
            const type = this.getType(tName, namespace);
            if(type) result.type = type;
            else throw new Error(`Unknown type: '${tName}'`);
        }

        //get items
        let value = 0;
        for(let child of eEnum.childNodes) {
            switch(child.tagName) {
                case 'item': {
                    let item = this._parseEnumItem(child, namespace);
                    if(item.value != undefined && item.value != null) {
                        value = item.value;
                    }
                    item.value = value++;
                    if(result.fields[item.value] != undefined) {
                        throw new Error(
                            `Multiple instances of value '${item.value}' in enum '${result.name}'`);
                    }
                    result.fields[item.value] = item;

                    if(result.fieldsByName[item.name] != undefined) {
                        throw new Error(
                            `Multiple instances of name '${item.name}' in enum '${result.name}'`);
                    }
                    result.fieldsByName[item.name] = item;
                    break;
                }

                default: this._parseGenericTag(result, child);
            }
        }
        return new Enum(result);
    }

    /** Parse one 'field' element for a struct. */
    _parseStructField(eField, offset, namespace=null, littleEndian=false) {
        if(namespace == null) namespace = this.types;

        //get offset
        const offs = int(eField.getAttribute('offset'), offset);

        const field = {
            offset: offs,
            littleEndian: this._getByteOrder(eField),
            count: int(eField.getAttribute('count'), 1),
            description: null,
            notes: [],
        };

        //get type
        const tName = eField.getAttribute('type');
        const type  = this.getType(tName, namespace);
        if(type == undefined) throw new TypeError(`Unknown type: '${tName}'`);
        field.type = type;

        //get name
        let name = eField.getAttribute('name');
        if(!name) name = `_${hex(offset,2)}`;
        field.name = name;

        //get notes
        for(let child of eField.childNodes) {
            this._parseGenericTag(field, child);
        }

        return new Field(field);
    }

    /** Parse one 'padding' element for a struct. */
    _parsePaddingField(ePadding, offset) {
        //get offset
        let offs = ePadding.getAttribute('offset');
        if(offs == undefined) offs = offset;

        const padding = new Padding({
            offset: offs,
            count: int(ePadding.getAttribute('count'), 1),
            value: int(ePadding.getAttribute('value'), undefined),
            description: null,
            notes: [],
        })

        //get notes
        for(let child of ePadding.childNodes) {
            this._parseGenericTag(padding, child);
        }

        return new Padding(padding);
    }

    /** Parse one 'struct' element. */
    parseStruct(eStruct, namespace) {
        if(namespace == null) namespace = this.types;
        const result = {
            name:         eStruct.getAttribute('name'),
            fields:       [],
            fieldsByName: {},
            notes:        [],
            description:  null,
            littleEndian: this._getByteOrder(eStruct),
        };
        //anonymous structs are fine
        //if(!result.name) throw new Error("No name specified for struct");

        //get elements
        let offset = 0;
        for(let child of eStruct.childNodes) {
            switch(child.tagName) {
                case 'padding': {
                    const field = this._parsePaddingField(child, offset);
                    offset = field.offset + field.size;
                    console.assert(!isNaN(field.size));
                    result.fields.push(field);
                    break;
                }

                case 'field': {
                    const field = this._parseStructField(
                        child, offset, namespace, result.littleEndian);
                    console.assert(!isNaN(field.size));
                    if(result.fieldsByName[field.name]) {
                        let sName = result.name;
                        if(!sName) sName = '(anonymous)';
                        //debugger;
                        //throw new Error(
                        //    `Duplicate field name: '${field.name}' in struct '${sName}'`);
                        console.warn(`Duplicate field name: '${field.name}' in struct '${sName}'`);
                    }
                    result.fieldsByName[field.name] = field;
                    result.fields.push(field);
                    offset = field.offset + field.size;
                    break;
                }

                default: this._parseGenericTag(result, child);
            }
        }
        return new Struct(result);
    }

    /** Parse one 'typedef' element. */
    parseTypedef(eDef, namespace) {
        if(namespace == null) namespace = this.types;
        const name  = eDef.getAttribute('name');
        const tName = eDef.getAttribute('type');
        const type  = this.getType(tName, namespace);
        if(namespace[name]) {
            throw new Error(`Duplicate type name: ${name}`);
        }
        namespace[name] = type;
        type._realName = tName;
        return null;
    }

    /** Parse an XML structs document. */
    async parseFile(path, namespace=null) {
        const parsers = {
            struct:  elem => this.parseStruct (elem, namespace),
            enum:    elem => this.parseEnum   (elem, namespace),
            typedef: elem => this.parseTypedef(elem, namespace),
            //include is a special case
        };

        console.log("Parsing", path);
        this._parsedPaths.add(path);
        const xml   = await getXml(path);
        const types = xml.getElementsByTagName('types').item(0);
        const nsName = types.getAttribute('namespace');
        if(namespace == null) namespace = this.types;
        if(nsName != null && nsName != undefined) {
            if(nsName == '') throw new Error("Empty namespace name");
            console.log("new ns", nsName);
            if(namespace[nsName] == undefined) {
                const newNs = this._newNamespace(nsName, namespace);
                namespace[nsName] = newNs;
            }
            namespace = namespace[nsName];
        }

        for(let type of types.childNodes) {
            if(type.tagName == undefined) continue;
            else if(type.tagName == 'include') {
                let dir = path.split('/');
                dir.pop(); //remove name
                dir.push(type.getAttribute('path'));
                dir = dir.join('/');
                if(!this._parsedPaths.has(dir)) {
                    await this.parseFile(dir, namespace);
                }
            }
            else {
                const parser = parsers[type.tagName];
                if(!parser) {
                    throw new TypeError(`Unexpected element: ${type.tagName}`);
                }
                const obj = parser(type);
                if(obj != null) {
                    if(namespace[obj.name]) {
                        throw new Error(`Duplicate type name: ${obj.name}`);
                    }
                    namespace[obj.name] = obj;
                }
            }
        }
        return namespace;
    }

    /** Get the specified type from the given namespace or its ancestors.
     *  @param {string} name The type name.
     *  @param {object} namespace The namespace to look in.
     *  @returns {Type} The type.
     *  @note Type name can specify a namespace using periods,
     *   eg "foo.bar.baz".
     *  @note If name isn't found in the given namespace, it will then
     *   check the namespace's parent, and so on. If the type isn't found
     *   in any namespace, an error is thrown.
     */
    getType(name, namespace=null) {
        if(namespace == null) namespace = this.types;
        while(namespace != undefined && namespace != null) {
            let result = namespace;
            for(let n of name.split('.')) {
                if(result == undefined) break;
                result = result[n];
            }
            if(result != undefined) return result;
            //console.log("Name", name, "not found in namespace", namespace);
            let parent = this._namespaceParents.get(namespace);
            console.assert(parent != namespace);
            namespace = parent;
        }
        throw new Error(`Type '${name}' not found`);
    }

    async selfTest() {
        console.log("struct self test begin");
        const structs = await this.parseFile('./data/types/common.xml');
        console.log("structs:", structs);
        const testBuffer = new ArrayBuffer(64);
        const testView = new DataView(testBuffer);
        structs.vec3f.toBytes({x:1, y:2, z:3}, testView);
        const testData = structs.vec3f.fromBytes(testView);
        console.assert(testData.x == 1);
        console.assert(testData.y == 2);
        console.assert(testData.z == 3);
        console.log(structs.vec3f.valueToString(testData));
        console.log("struct self test passed");
    }
}
