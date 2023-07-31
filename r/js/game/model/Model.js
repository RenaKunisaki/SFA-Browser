import { assertType, hex } from "../../Util.js";
import Game from "../Game.js";
import DisplayList from '../DisplayList.js';
import Texture from '../../app/ui/gl/Texture.js'

//struct types
let Header, DisplayListPtr, Shader, Bone, VertexGroup;

/** A model file in SFA. */
export default class SfaModel {
    constructor(game) {
        this.game = assertType(game, Game)
        this.app  = this.game.app;
        Header    = game.app.types.getType('sfa.models.Header');
        //XXX move some of these
        DisplayListPtr = this.app.types.getType('sfa.maps.DisplayListPtr');
        Shader = this.app.types.getType('sfa.maps.Shader');
        Bone = this.app.types.getType('sfa.models.Bone');
        VertexGroup = this.app.types.getType('sfa.models.VertexGroup');
    }

    static fromData(game, gx, data, dir) {
        const self        = new SfaModel(game);
        const header      = Header.fromBytes(data);
        self.header       = header;
        self.dir          = dir;
        self.gx           = gx;
        self.id           = header.cacheModNo;
        self.radi         = header.radi;
        console.log("Loading model", self);
        self._loadTextures(data);
        self._loadVtxData(data);
        self._loadPolygons(data);
        self._loadDlists(data);
        self._loadRenderInstrs(data);
        self._loadShaders(data);
        self._loadBones(data);
        self._loadVtxGroups(data);
        return self;
    }

    /** Load the model's textures.
     *  @param {DataView} view The view to read from.
     */
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

    /** Load the model's vertex data.
     *  @param {DataView} view The view to read from.
     */
    _loadVtxData(view) {
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

    /** Load the model's polygon data.
     *  @param {DataView} view The view to read from.
     */
    _loadPolygons(view) {
        const offs = view.byteOffset;
        this.polygons   = [];
        this.polyGroups = [];
        for(let i=0; i<this.header.nPolygons; i++) {
            //GCpolygons are hit detection mesh (XXX do models have these?)
            const offset = offs + this.header.GCpolygons + (i * GCPolygon.size);
            const poly   = GCPolygon.fromBytes(view, offset);
            poly.offset  = offset;
            poly.index   = i;
            this.polygons.push(poly);
        }
        for(let i=0; i<this.header.nPolyGroups; i++) {
            //poly groups are used for bone animation
            const offset = offs + this.header.polygonGroups + (i * PolygonGroup.size);
            const group  = PolygonGroup.fromBytes(view, offset);
            group.offset = offset;
            group.index  = i;
            this.polyGroups.push(group);
        }
        for(let i=0; i<this.header.nPolyGroups; i++) {
            //assign groups to polygons
            const group    = this.polyGroups[i];
            const lastPoly = this.polyGroups[i+1] ?
                this.polyGroups[i+1].firstPolygon : this.header.nPolyGons;
            for(let iPoly=group.firstPolygon; iPoly<lastPoly; iPoly++) {
                this.polygons[iPoly].groupIdx = i;
                this.polygons[iPoly].group = group;
            }
        }
    }

    /** Load the model's display lists.
     *  @param {DataView} view The view to read from.
     */
    _loadDlists(view) {
        const offs = view.byteOffset;
        this.dlists = [];
        for(let i=0; i<this.header.nDlists; i++) {
            let list = new DisplayList(this.game, view,
                this.header.dlists + (i * DisplayListPtr.size));
            //console.log("Read dlist", list);
            this.dlists.push(list);
        }
    }

    /** Load the model's render operations.
     *  @param {DataView} view The view to read from.
     */
    _loadRenderInstrs(view) {
        //these are a bit-packed instruction code
        const offs = view.byteOffset;
        this.renderInstrs = view.buffer.slice(
            offs + this.header.renderInstrs,
            offs + this.header.renderInstrs + this.header.nRenderInstrs,
        );
    }

    /** Load the model's shaders.
     *  @param {DataView} view The view to read from.
     */
    _loadShaders(view) {
        const offs = view.byteOffset;
        this.shaders = [];
        //console.assert(Shader.size == 0x44);
        for(let i=0; i<this.header.nShaders; i++) {
            this.shaders.push(Shader.fromBytes(view,
                offs + this.header.shaders + (i * Shader.size)));
        }
    }

    /** Load the model's bones.
     *  @param {DataView} view The view to read from.
     */
    _loadBones(view) {
        const offs = view.byteOffset;
        this.bones = [];
        for(let i=0; i<this.header.nBones; i++) {
            this.bones.push(Bone.fromBytes(view,
                offs + this.header.joints + (i * Bone.size)));
        }

        //compute the bone translations.
        //in the game code these are matrices that combine
        //a camera matrix and a translation. we don't need
        //a camera matrix here, so we store just a translation
        //vector instead of a matrix.
        //NOTE: _readVtxGroups() adds more to this.xlates.
        this.xlates = [];
        for(let i=0; i<this.header.nBones; i++) {
            let [_, tail] = this.calcBonePos(this.bones[i], false);
            this.xlates.push(tail);
        }
        //console.log("Model bone data", this.bones, "xlates", this.xlates);
    }

    /** Load the model's vertex groups.
     *  @param {DataView} view The view to read from.
     */
    _loadVtxGroups(view) {
        const offs = view.byteOffset;
        this.vtxGroups = [];
        for(let i=0; i<this.header.nVtxGroups; i++) {
            this.vtxGroups.push(VertexGroup.fromBytes(view,
                offs + this.header.vtxGroups + (i * VertexGroup.size)));
        }

        //scale the bone translations by the bone weights.
        for(let i=0; i<this.header.nVtxGroups; i++) {
            let grp   = this.vtxGroups[i];
            let bone0 = this.bones[grp.bone0];
            let bone1 = this.bones[grp.bone1];
            //the weight isn't scaled by 255 like you might expect.
            let wgt0 = grp.weight / 4;
            let wgt1 = 1.0 - wgt0;
            let [head0, tail0] = this.calcBonePos(bone0, true);
            let [head1, tail1] = this.calcBonePos(bone1, true);
            this.xlates.push(vec3.fromValues(
                (((tail0[0] * wgt0) + (tail1[0] * wgt1))) / 256,
                (((tail0[1] * wgt0) + (tail1[1] * wgt1))) / 256,
                (((tail0[2] * wgt0) + (tail1[2] * wgt1))) / 256,
            ));
        }
    }

    /** Calculate bone head/tail position relative to ancestors.
     *  @param {Bone} bone The bone to calculate.
     *  @param {boolean} relative Whether to treat the tail as
     *    an offset from the head. This is used when scaling
     *    the vertex groups.
     */
    calcBonePos(bone, relative, _depth=0) {
        if(_depth >= 10) throw new Error("Recursion limit exceeded");
        let head = vec3.fromValues(bone.translation.x,
            bone.translation.y, bone.translation.z);
        let tail = vec3.fromValues(bone.bindTranslation.x,
            bone.bindTranslation.y, bone.bindTranslation.z);
        if(bone.parent != 0xFF) {
            if(relative) {
                tail[0] -= head[0];
                tail[1] -= head[1];
                tail[2] -= head[2];
            }
            let parent = this.bones[bone.parent];
            let [pHead, _] = this.calcBonePos(parent, relative, _depth+1);
            head[0] += pHead[0];
            head[1] += pHead[1];
            head[2] += pHead[2];
        }
        return [head, tail];
    }
}
