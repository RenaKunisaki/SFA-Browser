import { fieldTypes } from "./Struct.js";
import { hex } from "../Util.js";

export default class BinaryFile {
    /** A wrapper for reading binary data. */
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
        switch(whence) {
            case 0: case 'SEEK_SET': this._readOffs = offs; break;
            case 1: case 'SEEK_CUR': this._readOffs += offs; break;
            case 2: case 'SEEK_END': this._readOffs = this.byteLength - offs; break;
            default: throw new RangeError("Invalid value for 'whence'");
        }
    }

    read(fmt, count=1) {
        /** Read some data from the file. */
        switch(typeof(fmt)) {
            case 'number': return this._readBytesMulti(count, fmt);
            case 'string': return this._readFmtStr    (count, fmt);
            default:       return this._readCls       (count, fmt);
        }
    }

    readBytes(count) {
        /** Read the given number of bytes. */
        const res = this.buffer.slice(this._readOffs, this._readOffs+count);
        this._readOffs += count;
        return res;
    }

    _readBytesMulti(count, len) {
        /** Read multiple sets of `len` bytes. */
        if(count == 1) return this.readBytes(len);
        const res = [];
        for(let i=0; i<count; i++) {
            res.push(this.readBytes(len));
        }
        return res;
    }

    _readFmtStr(count, fmt) {
        /** Read a Python-struct-style format string.
         *  XXX only one field is supported. eg "3H" not "3H2I"
         */
        let len = fmt.match(/\d+/);
        len = (len == null) ? 1 : parseInt(len);
        fmt = fmt.match(/\d*(.+)/)[1];

        if(fmt == 's') return this.readStrs(count, len); //len = max length
        else if(fmt == 'c') return this._readCharsMulti(count, len);
        else return this._readTypeMulti(count, len, fmt);
    }

    _readCls(count, cls) {
        /** Read a class defined using Struct */
        if(cls._size == undefined) {
            throw new TypeError(`Don't know how to read type: ${cls}`);
        }
        const res = [];
        for(let i=0; i<count; i++) {
            //console.log("read", cls, `from 0x${hex(this._readOffs)}`);
            const r = new cls(this.buffer, this._readOffs+this.byteOffset);
            //console.log(r);
            res.push(r);
            this._readOffs += cls._size;
        }
        return (count == 1) ? res[0] : res;
    }

    _readChars(count) {
        /** Read specified number of ASCII characters */
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

    readUtf8Char() {
        /** Read one UTF-8 code point. */
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

    readStr(maxLen, join=true) {
        /** Read UTF-8 string up to `maxLen` bytes */
        const res = [];
        const end = this._readOffs + maxLen;
        while(this._readOffs < end) {
            res.push(String.fromCodePoint(this.readUtf8Char()));
        }
        return join ? res.join('') : res;
    }

    readStrs(count, maxLen) {
        /** Read multiple UTF-8 strings */
        if(count == 1) return this.readStr(maxLen);
        const res = [];
        for(let i=0; i<count; i++) res.push(this.readStr(maxLen));
        return res;
    }

    _readType(len, fmt) {
        /** Read a primitive Struct type */
        const type = (typeof(fmt) == 'string') ? fieldTypes[fmt] : fmt;
        if(!type) throw new Error(`Unrecognized type "${fmt}"`);
        if(len == 1) {
            const res = type.func(this._view, this._readOffs, this._le);
            this._readOffs += type.size;
            return res;
        }
        const res = [];
        for(let i=0; i<len; i++) {
            res.push(this._readType(1, type));
        }
        return (len == 1) ? res[0] : res;
    }

    _readTypeMulti(count, len, fmt) {
        if(count == 1) return this._readType(len, fmt);
        const res = [];
        for(let i=0; i<count; i++) {
            res.push(this._readType(1, type));
        }
        return res;
    }

    readS8    (count=1) { return this._readType(count, 'b') }
    readU8    (count=1) { return this._readType(count, 'B') }
    readS16   (count=1) { return this._readType(count, 'h') }
    readU16   (count=1) { return this._readType(count, 'H') }
    readS32   (count=1) { return this._readType(count, 'i') }
    readU32   (count=1) { return this._readType(count, 'I') }
    readS64   (count=1) { return this._readType(count, 'q') }
    readU64   (count=1) { return this._readType(count, 'Q') }
    readFloat (count=1) { return this._readType(count, 'f') }
    readDouble(count=1) { return this._readType(count, 'd') }
}