//import { hex } from "../Util.js";
import { Type } from "./Struct/Type.js";

const fieldTypes = {
    //type: {size, func}
    //type is the character used to specify this type.
    //size is the number of bytes wide this type is.
    //func is the function used to read this type from a DataView.
    //func's params
    //  view: the view to read from.
    //  offs: byte offset to read from.
    //  LE:   true for little-endian, false for big-endian.
    b: {size:1, func:(view, offs, LE) => view.getInt8     (offs), },
    B: {size:1, func:(view, offs, LE) => view.getUint8    (offs), },
    h: {size:2, func:(view, offs, LE) => view.getInt16    (offs, LE), },
    H: {size:2, func:(view, offs, LE) => view.getUint16   (offs, LE), },
    i: {size:4, func:(view, offs, LE) => view.getInt32    (offs, LE), },
    I: {size:4, func:(view, offs, LE) => view.getUint32   (offs, LE), },
    q: {size:8, func:(view, offs, LE) => view.getBigInt64 (offs, LE), },
    Q: {size:8, func:(view, offs, LE) => view.getBigUint64(offs, LE), },
    f: {size:4, func:(view, offs, LE) => view.getFloat32  (offs, LE), },
    d: {size:8, func:(view, offs, LE) => view.getFloat64  (offs, LE), },
    c: {size:1, func:(view, offs, LE) =>
        String.fromCharCode(view.getUint8(offs)), },
};

/** A wrapper for reading binary data. */
export default class BinaryFile {
    constructor(buffer, byteOffset=0, byteLength=null, order='>') {
        if(buffer.buffer) {
            //if given a typed array, get the underlying buffer.
            byteOffset += buffer.byteOffset;
            buffer      = buffer.buffer;
        }
        if(byteLength == null) byteLength = buffer.byteLength - byteOffset;
        this.buffer     = buffer;
        this.byteLength = byteLength;
        this.byteOffset = byteOffset;
        this._le        = order == '<';
        this._readOffs  = 0;
        this._view      = new DataView(this.buffer, byteOffset, byteLength);
        //console.log(`BinaryFile offset=0x${hex(this.byteOffset)} len=0x${hex(this.byteLength)} data=0x${hex(this._view.getUint32(0))}`);
    }

    tell() { return this._readOffs }
    seek(offs, whence=0) {
        console.assert(!isNaN(offs), "Offset is NaN");
        console.assert(isFinite(offs), "Offset is infinity");
        switch(whence) {
            case 0: case 'set': case 'SEEK_SET': this._readOffs = offs; break;
            case 1: case 'cur': case 'SEEK_CUR': this._readOffs += offs; break;
            case 2: case 'end': case 'SEEK_END': this._readOffs = this.byteLength - offs; break;
            default: throw new RangeError("Invalid value for 'whence'");
        }
    }
    isEof() { return this._readOffs >= this.byteLength }

    getView(offset=0, length=0) {
        if(offset <  0) offset += this.byteLength;
        if(length <= 0) length += this.byteLength;
        if(length >= (this.byteLength - offset)) length = this.byteLength - offset;
        //console.assert(length > 0); can happen for empty files
        return new DataView(this.buffer, offset+this.byteOffset, length);
    }

    getBuffer(offset=0, length=0) {
        if(offset <  0) offset += this.byteLength;
        if(length <= 0) length += this.byteLength;
        if(length >= (this.byteLength - offset)) length = this.byteLength - offset;
        //console.assert(length > 0);
        return this.buffer.slice(offset+this.byteOffset,
            offset+this.byteOffset+length);
    }

    /** Read some data from the file. */
    read(fmt, count=1) {
        switch(typeof(fmt)) {
            case 'number': return this._readBytesMulti(count, fmt);
            case 'string': return this._readFmtStr    (count, fmt);
            default:       return this._readCls       (count, fmt);
        }
    }

    /** Read the given number of bytes.
     *  @param count Number of bytes.
     *  @returns {ArrayBuffer} Binary data.
     */
    readBytes(count) {
        const offs = this.byteOffset + this._readOffs;
        const res  = this.buffer.slice(offs, offs+count);
        this._readOffs += count;
        return res;
    }

    /** Read multiple sets of `len` bytes. */
    _readBytesMulti(count, len) {
        if(count == 1) return this.readBytes(len);
        const res = [];
        for(let i=0; i<count; i++) {
            res.push(this.readBytes(len));
        }
        return res;
    }

    /** Read a Python-struct-style format string.
     *  XXX only one field is supported. eg "3H" not "3H2I"
     */
    _readFmtStr(count, fmt) {
        let len = fmt.match(/\d+/);
        len = (len == null) ? 1 : parseInt(len);
        fmt = fmt.match(/\d*(.+)/)[1];

        if(fmt == 's') return this.readStrs(count, len); //len = max length
        else if(fmt == 'c') return this._readCharsMulti(count, len);
        else return this._readTypeMulti(count, len, fmt);
    }

    /** Read a class defined using Struct */
    _readCls(count, cls) {
        if(!(cls instanceof Type)) {
            throw new TypeError(`Don't know how to read type: ${cls}`);
        }
        let result;
        if(count == 1) result = cls.fromBytes(this._view, this._readOffs);
        else result = cls.arrayFromBytes(this._view, count, this._readOffs);
        this._readOffs += cls.size * count;
        return result;
    }

    /** Read specified number of ASCII characters */
    _readChars(count) {
        const res = [];
        for(let i=0; i<count; i++) {
            res.push(String.fromCharCode(this.readU8()));
        }
        return (count == 1) ? res[0] : res;
    }

    _readCharsMulti(count, len) {
        if(count == 1) return this._readChars(len);
        const res = [];
        for(let i=0; i<count; i++) res.push(this._readChars(len));
        return res;
    }

    /** Read one UTF-8 code point. */
    readUtf8Char() {
        let n = 0;
        let c = this.readU8();
        if     (c >= 0xF0) { n = 3; c &= 0x07 }
        else if(c >= 0xE0) { n = 2; c &= 0x0F }
        else if(c >= 0xC0) { n = 1; c &= 0x1F }

        while(n > 0 && this._readOffs < this.byteLength) {
            const c2 = this.readU8();
            if((c2 & 0xC0) != 0x80) {
                c = 0xFFFD; //replacement character
                break;
            }
            else {
                c = (c << 6) | (c2 & 0x3F);
                n--;
            }
        }
        if(n > 0) c = 0xFFFD; //truncated character
        return c;
    }

    /** Read UTF-8 string up to `maxLen` bytes */
    readStr(maxLen, join=true, nulls=false) {
        const res = [];
        let   end = this._readOffs + maxLen;
        if(end >= this.byteLength) end = this.byteLength - 1;
        while(this._readOffs < end) {
            let c = this.readUtf8Char();
            if(!c) {
                if(nulls) c = 0x20; //c = 0x2400; //U+2400 SYMBOL FOR NULL
                else break;
            }
            res.push(String.fromCodePoint(c));
        }
        return join ? res.join('') : res;
    }

    /** Read multiple UTF-8 strings */
    readStrs(count, maxLen) {
        if(count == 1) return this.readStr(maxLen);
        const res = [];
        for(let i=0; i<count; i++) res.push(this.readStr(maxLen));
        return res;
    }

    /** Read a primitive Struct type */
    _readType(len, fmt, forceArray=false) {
        const type = (typeof(fmt) == 'string') ? fieldTypes[fmt] : fmt;
        if(!type) throw new Error(`Unrecognized type "${fmt}"`);
        if(len < 0) throw new RangeError(`len must be >= 0 (was ${len})`);
        else if(len == 0) return [];
        else if(len == 1 && !forceArray) {
            const res = type.func(this._view, this._readOffs, this._le);
            this._readOffs += type.size;
            return res;
        }
        const res = [];
        for(let i=0; i<len; i++) {
            res.push(this._readType(1, type));
        }
        return (len == 1 && !forceArray) ? res[0] : res;
    }

    _readTypeMulti(count, len, fmt) {
        if(count == 1) return this._readType(len, fmt);
        const res = [];
        for(let i=0; i<count; i++) {
            res.push(this._readType(1, type));
        }
        return res;
    }

    readS8         (count=1) { return this._readType(count, 'b') }
    readU8         (count=1) { return this._readType(count, 'B') }
    readS16        (count=1) { return this._readType(count, 'h') }
    readU16        (count=1) { return this._readType(count, 'H') }
    readS32        (count=1) { return this._readType(count, 'i') }
    readU32        (count=1) { return this._readType(count, 'I') }
    readS64        (count=1) { return this._readType(count, 'q') }
    readU64        (count=1) { return this._readType(count, 'Q') }
    readFloat      (count=1) { return this._readType(count, 'f') }
    readDouble     (count=1) { return this._readType(count, 'd') }
    readS8Array    (count=1) { return this._readType(count, 'b', true) }
    readU8Array    (count=1) { return this._readType(count, 'B', true) }
    readS16Array   (count=1) { return this._readType(count, 'h', true) }
    readU16Array   (count=1) { return this._readType(count, 'H', true) }
    readS32Array   (count=1) { return this._readType(count, 'i', true) }
    readU32Array   (count=1) { return this._readType(count, 'I', true) }
    readS64Array   (count=1) { return this._readType(count, 'q', true) }
    readU64Array   (count=1) { return this._readType(count, 'Q', true) }
    readFloatArray (count=1) { return this._readType(count, 'f', true) }
    readDoubleArray(count=1) { return this._readType(count, 'd', true) }
}
