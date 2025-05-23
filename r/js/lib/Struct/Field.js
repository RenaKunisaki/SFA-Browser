import { Type } from "./Type.js";

/** One field of a struct. */
export default class Field extends Type {
    /** Construct a Field.
     *  @param {int} offset The byte offset within the struct.
     *  @param {Type} type The data type.
     *  @param {string} name The field name.
     *  @param {bool} littleEndian whether to use little endian byte order.
     *  @param {int} count The array count, if applicable.
     *  @param {string} description A description of the field.
     *  @param {string[]} notes Some notes about the field.
     *  @note This should be called by the parser. You shouldn't
     *   need to call it yourself.
     */
    constructor(params) {
        super();
        console.assert(params.type instanceof Type);
        console.assert(params.type.size);
        this.offset       = params.offset;
        this.type         = params.type;
        this.name         = params.name;
        this.count        = params.count;
        this.littleEndian = params.littleEndian;
        this._size        = this.type.size * this.count;
        this.description  = params.description;
        this.notes        = params.notes;
    }

    get size() { return this._size; }
    get typeName() { return this.type.typeName }

    /** Read this field from a DataView.
     *  @param {DataView} view The view to read from.
     *  @param {int} offset The byte offset to read from.
     *  @param {bool} littleEndian whether to use little endian byte order.
     *  @returns The value read from the view.
     */
    fromBytes(view, offset=0, littleEndian=undefined) {
        if(littleEndian == undefined) littleEndian = this.littleEndian;
        if(this.count == 1) {
            return this.type.fromBytes(view, offset, littleEndian);
        }
        return this.type.arrayFromBytes(view, this.count, offset, littleEndian);
    }

    /** Write this field to a DataView.
     *  @param value Value to write.
     *  @param {DataView} data View to write into.
     *  @param {int} offset Byte offset to write to.
     *  @param {bool} littleEndian whether to use little endian byte order.
     *  @returns {DataView} The view that was written to.
     */
    toBytes(value, view, offset=0, littleEndian=undefined) {
        if(littleEndian == undefined) littleEndian = this.littleEndian;
        if(this.count == 1) {
            return this.type.toBytes(value, view, offset, littleEndian);
        }
        return this.type.arrayToBytes(value, view, offset, littleEndian);
    }

    /** Convert this field to a string, for debugging.
     *  @param value Value to convert.
     *  @returns {string} String representation.
     */
    valueToString(value) {
        if(this.count == 1) return this.type.toString(value);
        console.assert(value.length == this.count);
        let result = [];
        let length = 1;
        for(let i=0; i<this.count; i++) {
            let s = this.type.toString(value[i]);
            result.push(s);
            length += s + 2;
            if(length >= 100) {
                result.push('...');
                break;
            }
        }
        return '[' + result.join(', ') + ']';
    }
}
