import { assertType, hex } from "../../Util.js";
import Game from "../Game.js";
import DisplayList from '../DisplayList.js';
import Texture from '../../app/ui/gl/Texture.js'

//struct types
let Header, DisplayListPtr, Shader;

export default class SfaModel {
    /** A model file in SFA. */
    constructor(game) {
        this.game = assertType(game, Game)
        this.app  = this.game.app;
        Header    = game.app.types.getType('sfa.models.Header');
        //XXX move some of these
        DisplayListPtr = this.app.types.getType('sfa.maps.DisplayListPtr');
        Shader = this.app.types.getType('sfa.maps.Shader');
    }

    static fromData(game, gx, data, dir) {
        const self        = new SfaModel(game);
        const header      = Header.fromBytes(data);
        self.header       = header;
        self.dir          = dir;
        self.gx           = gx;
        self.id           = header.cacheModNo;
        self.radi         = header.radi;
        //self.bones        = [];
        //self.boneQuats    = [];
        //self.vtxGroups    = [];
        //self.hitSpheres   = [];
        //self.GCpolygons   = [];
        //self.polyGroups   = [];
        //self.dlists       = [];
        console.log("Loading model", self);
        self._loadTextures(data);
        self._loadVtxData(data);
        self._loadPolygons(data);
        self._loadDlists(data);
        self._loadRenderInstrs(data);
        self._loadShaders(data);
        return self;
    }

    _loadTextures(view) {
        this.textures = [];
        for(let i=0; i<this.header.nTextures; i++) {
            let tId = view.getUint32(this.header.textures + (i*4));
            tId = -(tId | 0x8000); //game does this - forces IDs to be idxs into TEX1
            const gTex = this.game.loadTexture(tId, this.dir);
            if(gTex) {
                const tex = new Texture(this.gx.context);
                tex.loadGameTexture(gTex);
                this.textures.push(tex);
            }
            else {
                console.warn(`Failed loading texture 0x${hex(tId)}`);
                this.textures.push(this.gx.missingTexture);
            }
        }
    }

    _loadVtxData(view) {
        //read vertex data
        const offs = view.byteOffset;
        this.vtxPositions = view.buffer.slice( //vec3s[]
            offs + this.header.vertexPositions,
            offs + this.header.vertexPositions + (this.header.nVtxs * 6),
        );
        this.vtxNormals = view.buffer.slice( //vec3s[]
            offs + this.header.vertexNormals,
            offs + this.header.vertexNormals + (this.header.nNormals * 6),
        );
        this.vtxColors = view.buffer.slice( //u16[]
            offs + this.header.vertexColors,
            offs + this.header.vertexColors + (this.header.nColors * 2),
        );
        this.texCoords = view.buffer.slice( //vec2s[]
            offs + this.header.vertexTexCoords,
            offs + this.header.vertexTexCoords + (this.header.nTexCoords * 4),
        );
    }

    _loadPolygons(view) {
        //read polygon data
        const offs = view.byteOffset;
        this.polygons   = [];
        this.polyGroups = [];
        for(let i=0; i<this.header.nPolygons; i++) {
            const offset = offs + this.header.GCpolygons + (i * GCPolygon.size);
            const poly   = GCPolygon.fromBytes(view, offset);
            poly.offset  = offset;
            poly.index   = i;
            this.polygons.push(poly);
        }
        for(let i=0; i<this.header.nPolyGroups; i++) {
            const offset = offs + this.header.polygonGroups + (i * PolygonGroup.size);
            const group  = PolygonGroup.fromBytes(view, offset);
            group.offset = offset;
            group.index  = i;
            this.polyGroups.push(group);
        }
        for(let i=0; i<this.header.nPolyGroups; i++) {
            const group    = this.polyGroups[i];
            const lastPoly = this.polyGroups[i+1] ?
                this.polyGroups[i+1].firstPolygon : this.header.nPolyGons;
            for(let iPoly=group.firstPolygon; iPoly<lastPoly; iPoly++) {
                this.polygons[iPoly].groupIdx = i;
                this.polygons[iPoly].group = group;
            }
        }
    }

    _loadDlists(view) {
        //read display lists
        const offs = view.byteOffset;
        this.dlists = [];
        for(let i=0; i<this.header.nDlists; i++) {
            let list = new DisplayList(this.game, view,
                this.header.dlists + (i * DisplayListPtr.size));
            console.log("Read dlist", list);
            this.dlists.push(list);
        }
    }

    _loadRenderInstrs(view) {
        //read render instructions (bit-packed stream)
        const offs = view.byteOffset;
        this.renderInstrs = view.buffer.slice(
            offs + this.header.renderInstrs,
            offs + this.header.renderInstrs + this.header.nRenderInstrs,
        );
    }

    _loadShaders(view) {
        //read shader data
        const offs = view.byteOffset;
        this.shaders = [];
        //console.assert(Shader.size == 0x44);
        for(let i=0; i<this.header.nShaders; i++) {
            this.shaders.push(Shader.fromBytes(view,
                offs + this.header.shaders + (i * Shader.size)));
        }
    }
}
