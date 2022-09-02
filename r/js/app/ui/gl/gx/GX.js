import VertexBuffer from './VertexBuffer.js';
//import BP from './BP.js';
import CP from './CP.js';
import XF from './XF.js';
import DlistParser from './DlistParser.js';
import Program from '../Program.js';
import Texture from '../Texture.js';
import {get} from '/r/js/Util.js';
import RenderBatch from './RenderBatch.js';

function CHECK_ERROR(gl) {
    const err = gl.getError();
    console.assert(!err);
}

//the order the fields appear in in a display list. this never changes.
export const VAT_FIELD_ORDER = [
    'PNMTXIDX', 'T0MIDX', 'T1MIDX', 'T2MIDX', 'T3MIDX', 'T4MIDX',
    'T5MIDX', 'T6MIDX', 'T7MIDX', 'POS', 'NRM', 'COL0', 'COL1',
    'TEX0', 'TEX1', 'TEX2', 'TEX3', 'TEX4', 'TEX5', 'TEX6',
    'TEX7'];

const _GX_TF_CTF = 0x20; /* copy-texture-format only */
const _GX_TF_ZTF = 0x10; /* Z-texture-format */

export default class GX {
    /** GameCube GPU simulator.
     *  While nowhere near precise enough to be considered an emulator, this
     *  class functions roughly the same as the real GX chip - give it arrays
     *  containing display list and vertex attribute data, set up the registers
     *  telling how the data is formatted, and it renders an image.
     */
    static Attr = {
        PNMTXIDX:      0x00, //position/normal matrix index
        TEX0MTXIDX:    0x01, //texture 0 matrix index
        TEX1MTXIDX:    0x02, //texture 1 matrix index
        TEX2MTXIDX:    0x03, //texture 2 matrix index
        TEX3MTXIDX:    0x04, //texture 3 matrix index
        TEX4MTXIDX:    0x05, //texture 4 matrix index
        TEX5MTXIDX:    0x06, //texture 5 matrix index
        TEX6MTXIDX:    0x07, //texture 6 matrix index
        TEX7MTXIDX:    0x08, //texture 7 matrix index
        POS:           0x09, //position
        NRM:           0x0A, //normal
        CLR0:          0x0B, //color 0
        CLR1:          0x0C, //color 1
        TEX0:          0x0D, //input texture coordinate 0
        TEX1:          0x0E, //input texture coordinate 1
        TEX2:          0x0F, //input texture coordinate 2
        TEX3:          0x10, //input texture coordinate 3
        TEX4:          0x11, //input texture coordinate 4
        TEX5:          0x12, //input texture coordinate 5
        TEX6:          0x13, //input texture coordinate 6
        TEX7:          0x14, //input texture coordinate 7
        POS_MTX_ARRAY: 0x15, //position matrix array pointer
        NRM_MTX_ARRAY: 0x16, //normal matrix array pointer
        TEX_MTX_ARRAY: 0x17, //texture matrix array pointer
        LIGHT_ARRAY:   0x18, //light parameter array pointer
        NBT:           0x19, //normal, bi-normal, tangent
        MAX_ATTR:      0x1A, //maximum number of vertex attributes
        NULL:          0xFF, //NULL attribute (to mark end of lists)
    };
    static AttrType = {
        NONE:    0,
        DIRECT:  1,
        INDEX8:  2,
        INDEX16: 3,
    };
    static TexGenType = {
        TG_MTX3x4: 0x00,
        TG_MTX2x4: 0x01,
        TG_BUMP0:  0x02,
        TG_BUMP1:  0x03,
        TG_BUMP2:  0x04,
        TG_BUMP3:  0x05,
        TG_BUMP4:  0x06,
        TG_BUMP5:  0x07,
        TG_BUMP6:  0x08,
        TG_BUMP7:  0x09,
        TG_SRTG:   0x0A,
    };
    static TexGenSrc = {
        TG_POS:       0x00,
        TG_NRM:       0x01,
        TG_BINRM:     0x02,
        TG_TANGENT:   0x03,
        TG_TEX0:      0x04,
        TG_TEX1:      0x05,
        TG_TEX2:      0x06,
        TG_TEX3:      0x07,
        TG_TEX4:      0x08,
        TG_TEX5:      0x09,
        TG_TEX6:      0x0A,
        TG_TEX7:      0x0B,
        TG_TEXCOORD0: 0x0C,
        TG_TEXCOORD1: 0x0D,
        TG_TEXCOORD2: 0x0E,
        TG_TEXCOORD3: 0x0F,
        TG_TEXCOORD4: 0x10,
        TG_TEXCOORD5: 0x11,
        TG_TEXCOORD6: 0x12,
        TG_COLOR0:    0x13,
        TG_COLOR1:    0x14,
    };
    static CompCnt = {
        POS_XY:   0,
        POS_XYZ:  1,
        NRM_XYZ:  0,
        NRM_NBT:  1, // one index per NBT
        NRM_NBT3: 2, // one index per each of N/B/T
        CLR_RGB:  0,
        CLR_RGBA: 1,
        TEX_S:    0,
        TEX_ST:   1,
    };
    static CompType = {
        U8:     0,
        S8:     1,
        U16:    2,
        S16:    3,
        F32:    4,
        RGB565: 0,
        RGB8:   1,
        RGBX8:  2,
        RGBA4:  3,
        RGBA6:  4,
        RGBA8:  5,
    };
    static ChannelID = {
        COLOR0:      0x00,
        COLOR1:      0x01,
        ALPHA0:      0x02,
        ALPHA1:      0x03,
        COLOR0A0:    0x04, //Color 0 + Alpha 0
        COLOR1A1:    0x05, //Color 1 + Alpha 1
        COLOR_ZERO:  0x06, //RGBA = 0
        ALPHA_BUMP:  0x07, //bump alpha 0-248, RGB=0
        ALPHA_BUMPN: 0x08, //normalized bump alpha, 0-255, RGB=0
        COLOR_NULL:  0xFF,
    };
    static ColorSrc = {
        SRC_REG: 0,
        SRC_VTX: 1,
    };
    static LightID = {
        LIGHT0:     0x001,
        LIGHT1:     0x002,
        LIGHT2:     0x004,
        LIGHT3:     0x008,
        LIGHT4:     0x010,
        LIGHT5:     0x020,
        LIGHT6:     0x040,
        LIGHT7:     0x080,
        MAX_LIGHT:  0x100,
        LIGHT_NULL: 0x000,
    };
    static DiffuseFn = {
        NONE:  0,
        SIGN:  1,
        CLAMP: 2,
    };
    static AttnFn = {
        SPEC: 0, //use specular attenuation
        SPOT: 1, //use distance/spotlight attenuation
        NONE: 2, //attenuation is off
    };
    static SpotFn = {
        OFF:   0x00,
        FLAT:  0x01,
        COS:   0x02,
        COS2:  0x03,
        SHARP: 0x04,
        RING1: 0x05,
        RING2: 0x06,
    };
    static DistAttnFn = {
        OFF:    0,
        GENTLE: 1,
        MEDIUM: 2,
        STEEP:  3,
    };
    static PosNrmMtx = {
        PNMTX0:  0,
        PNMTX1:  3,
        PNMTX2:  6,
        PNMTX3:  9,
        PNMTX4: 12,
        PNMTX5: 15,
        PNMTX6: 18,
        PNMTX7: 21,
        PNMTX8: 24,
        PNMTX9: 27,
    };
    static TexMtx = {
        TEXMTX0:  30,
        TEXMTX1:  33,
        TEXMTX2:  36,
        TEXMTX3:  39,
        TEXMTX4:  42,
        TEXMTX5:  45,
        TEXMTX6:  48,
        TEXMTX7:  51,
        TEXMTX8:  54,
        TEXMTX9:  57,
        IDENTITY: 60
    };
    static PTTexMtx = {
        PTTEXMTX0:   64,
        PTTEXMTX1:   67,
        PTTEXMTX2:   70,
        PTTEXMTX3:   73,
        PTTEXMTX4:   76,
        PTTEXMTX5:   79,
        PTTEXMTX6:   82,
        PTTEXMTX7:   85,
        PTTEXMTX8:   88,
        PTTEXMTX9:   91,
        PTTEXMTX10:  94,
        PTTEXMTX11:  97,
        PTTEXMTX12: 100,
        PTTEXMTX13: 103,
        PTTEXMTX14: 106,
        PTTEXMTX15: 109,
        PTTEXMTX16: 112,
        PTTEXMTX17: 115,
        PTTEXMTX18: 118,
        PTTEXMTX19: 121,
        PTIDENTITY: 125,
    };
    static TexMtxType = {
        MTX3x4: 0,
        MTX2x4: 1,
    };
    static Primitive = {
        POINTS:        0xB8,
        LINES:         0xA8,
        LINESTRIP:     0xB0,
        TRIANGLES:     0x90,
        TRIANGLESTRIP: 0x98,
        TRIANGLEFAN:   0xA0,
        QUADS:         0x80,
    };
    static TexOffset = {
        ZERO:          0,
        SIXTEENTH:     1,
        EIGHTH:        2,
        FOURTH:        3,
        HALF:          4,
        ONE:           5,
        MAX_TEXOFFSET: 6,
    };
    static CullMode = {
        NONE:  0,
        FRONT: 1,
        BACK:  2,
        ALL:   3,
    };
    static ClipMode = {
        // Note: these are (by design) backwards of typical enable/disables!
        ENABLE:  0,
        DISABLE: 1,
    };
    static TexWrapMode = {
        CLAMP:           0,
        REPEAT:          1,
        MIRROR:          2,
        MAX_TEXWRAPMODE: 3,
    };
    static TexFilter = {
        NEAR:          0,
        LINEAR:        1,
        NEAR_MIP_NEAR: 2,
        LIN_MIP_NEAR:  3,
        NEAR_MIP_LIN:  4,
        LIN_MIP_LIN:   5,
    };
    static CITexFmt = {
        C4:    0x8,
        C8:    0x9,
        C14X2: 0xA,
    };
    static TexFmt = {
        TF_I4:     0x0,
        TF_I8:     0x1,
        TF_IA4:    0x2,
        TF_IA8:    0x3,
        TF_RGB565: 0x4,
        TF_RGB5A3: 0x5,
        TF_RGBA8:  0x6,
        TF_CMPR:   0xE,
        CTF_R4:    0x0 | _GX_TF_CTF,
        CTF_RA4:   0x2 | _GX_TF_CTF,
        CTF_RA8:   0x3 | _GX_TF_CTF,
        CTF_YUVA8: 0x6 | _GX_TF_CTF,
        CTF_A8:    0x7 | _GX_TF_CTF,
        CTF_R8:    0x8 | _GX_TF_CTF,
        CTF_G8:    0x9 | _GX_TF_CTF,
        CTF_B8:    0xA | _GX_TF_CTF,
        CTF_RG8:   0xB | _GX_TF_CTF,
        CTF_GB8:   0xC | _GX_TF_CTF,
        TF_Z8:     0x1 | _GX_TF_ZTF,
        TF_Z16:    0x3 | _GX_TF_ZTF,
        TF_Z24X8:  0x6 | _GX_TF_ZTF,
        CTF_Z4:    0x0 | _GX_TF_ZTF | _GX_TF_CTF,
        CTF_Z8M:   0x9 | _GX_TF_ZTF | _GX_TF_CTF,
        CTF_Z8L:   0xA | _GX_TF_ZTF | _GX_TF_CTF,
        CTF_Z16L:  0xC | _GX_TF_ZTF | _GX_TF_CTF,
        TF_A8:     0x7 | _GX_TF_CTF, // to keep compatibility
    };
    static TlutFmt = {
        IA8:         0x0,
        RGB565:      0x1,
        RGB5A3:      0x2,
        MAX_TLUTFMT: 0x3,
    };
    static TlutSize = {
        TLUT_16:     1,	// number of 16 entry blocks.
        TLUT_32:     2,
        TLUT_64:     4,
        TLUT_128:    8,
        TLUT_256:   16,
        TLUT_512:   32,
        TLUT_1K:    64,
        TLUT_2K:   128,
        TLUT_4K:   256,
        TLUT_8K:   512,
        TLUT_16K: 1024,
    };
    static Tlut = {
        // default 256-entry TLUTs
        TLUT0:    0x00,
        TLUT1:    0x01,
        TLUT2:    0x02,
        TLUT3:    0x03,
        TLUT4:    0x04,
        TLUT5:    0x05,
        TLUT6:    0x06,
        TLUT7:    0x07,
        TLUT8:    0x08,
        TLUT9:    0x09,
        TLUT10:   0x0A,
        TLUT11:   0x0B,
        TLUT12:   0x0C,
        TLUT13:   0x0D,
        TLUT14:   0x0E,
        TLUT15:   0x0F,
        BIGTLUT0: 0x10,
        BIGTLUT1: 0x11,
        BIGTLUT2: 0x12,
        BIGTLUT3: 0x13,
    };
    static TexMapID = {
        TEXMAP0:      0x00,
        TEXMAP1:      0x01,
        TEXMAP2:      0x02,
        TEXMAP3:      0x03,
        TEXMAP4:      0x04,
        TEXMAP5:      0x05,
        TEXMAP6:      0x06,
        TEXMAP7:      0x07,
        MAX_TEXMAP:   0x08,
        TEXMAP_NULL:  0xFF,
        TEX_DISABLE:  0x100, //mask: disables texture look up
    };
    static TexCacheSize = {
        TEXCACHE_32K:  0,
        TEXCACHE_128K: 1,
        TEXCACHE_512K: 2,
        TEXCACHE_NONE: 3,
    };
    static IndTexFormat = {
        ITF_8: 0, //8 bit texture offsets.
        ITF_5: 1, //5 bit texture offsets.
        ITF_4: 2, //4 bit texture offsets.
        ITF_3: 3, //3 bit texture offsets.
        MAX_ITFORMAT: 4,
    };
    static IndTexBiasSel = {
        NONE: 0,
        S:    1,
        T:    2,
        ST:   3,
        U:    4,
        SU:   5,
        TU:   6,
        STU:  7,
        MAX_ITBIAS: 8,
    };
    static IndTexAlphaSel = {
        OFF: 0,
        S:   1,
        T:   2,
        U:   3,
        MAX_ITBALPHA: 4,
    };
    static IndTexMtxID = {
        ITM_OFF: 0,
        ITM_0:   1,
        ITM_1:   2,
        ITM_2:   3, //skip 4
        ITM_S0:  5,
        ITM_S1:  6,
        ITM_S2:  7, //skip 8
        ITM_T0:  9,
        ITM_T1: 10,
        ITM_T2: 11,
    };
    static IndTexWrap = {
        ITW_OFF: 0, //no wrapping
        ITW_256: 1, //wrap 256
        ITW_128: 2, //wrap 128
        ITW_64:  3, //wrap 64
        ITW_32:  4, //wrap 32
        ITW_16:  5, //wrap 16
        ITW_0:   6, //wrap 0
        MAX_ITWRAP: 7,
    };
    static IndTexScale = {
        ITS_1:   0, //Scale by 1.
        ITS_2:   1, //Scale by 1/2.
        ITS_4:   2, //Scale by 1/4.
        ITS_8:   3, //Scale by 1/8.
        ITS_16:  4, //Scale by 1/16.
        ITS_32:  5, //Scale by 1/32.
        ITS_64:  6, //Scale by 1/64.
        ITS_128: 7, //Scale by 1/128.
        ITS_256: 8, //Scale by 1/256.
        MAX_ITSCALE: 9,
    };
    //GXIndTexStageID just maps n to n
    //GXTevStageID just maps n to n
    static TevRegID = {
        TEVPREV: 0,
        TEVREG0: 1,
        TEVREG1: 2,
        TEVREG2: 3,
        MAX_TEVREG: 4,
    };
    static TevOp = {
        ADD:            0,
        SUB:            1,
        COMP_R8_GT:     8,
        COMP_R8_EQ:     9,
        COMP_GR16_GT:  10,
        COMP_GR16_EQ:  11,
        COMP_BGR24_GT: 12,
        COMP_BGR24_EQ: 13,
        COMP_RGB8_GT:  14,
        COMP_RGB8_EQ:  15,
        COMP_A8_GT:    14, // for alpha channel
        COMP_A8_EQ:    15  // for alpha channel
    };
    static TevColorArg = {
        CPREV:   0x00,
        APREV:   0x01,
        C0:      0x02,
        A0:      0x03,
        C1:      0x04,
        A1:      0x05,
        C2:      0x06,
        A2:      0x07,
        TEXC:    0x08,
        TEXA:    0x09,
        RASC:    0x0A,
        RASA:    0x0B,
        ONE:     0x0C,
        HALF:    0x0D,
        KONST:   0x0E,
        ZERO:    0x0F,
        TEXRRR:  0x10, // obsolete
        TEXGGG:  0x11, // obsolete
        TEXBBB:  0x12, // obsolete
        QUARTER: 0x0E, // obsolete, to keep compatibility
    };
    static TevAlphaArg = {
        APREV: 0,
        A0:    1,
        A1:    2,
        A2:    3,
        TEXA:  4,
        RASA:  5,
        KONST: 6,
        ZERO:  7,
        ONE:   6, //obsolete, to keep compatibility
    };
    static TevBias = {
        ZERO:        0,
        ADDHALF:     1,
        SUBHALF:     2,
        MAX_TEVBIAS: 3,
    };
    static TevClampMode = {
        LINEAR: 0,
        GE:     1,
        EQ:     2,
        LE:     3,
        MAX_TEVCLAMPMODE: 4,
    };
    //TevKColorID just maps n to n
    static TevKColorSel = {
        KCSEL_8_8:  0x00,
        KCSEL_7_8:  0x01,
        KCSEL_6_8:  0x02,
        KCSEL_5_8:  0x03,
        KCSEL_4_8:  0x04,
        KCSEL_3_8:  0x05,
        KCSEL_2_8:  0x06,
        KCSEL_1_8:  0x07,
        KCSEL_1:    0x00,
        KCSEL_3_4:  0x02,
        KCSEL_1_2:  0x04,
        KCSEL_1_4:  0x06,
        KCSEL_K0:   0x0C,
        KCSEL_K1:   0x0D,
        KCSEL_K2:   0x0E,
        KCSEL_K3:   0x0F,
        KCSEL_K0_R: 0x10,
        KCSEL_K1_R: 0x11,
        KCSEL_K2_R: 0x12,
        KCSEL_K3_R: 0x13,
        KCSEL_K0_G: 0x14,
        KCSEL_K1_G: 0x15,
        KCSEL_K2_G: 0x16,
        KCSEL_K3_G: 0x17,
        KCSEL_K0_B: 0x18,
        KCSEL_K1_B: 0x19,
        KCSEL_K2_B: 0x1A,
        KCSEL_K3_B: 0x1B,
        KCSEL_K0_A: 0x1C,
        KCSEL_K1_A: 0x1D,
        KCSEL_K2_A: 0x1E,
        KCSEL_K3_A: 0x1F,
    };
    static TevKAlphaSel = {
        KASEL_8_8:  0x00,
        KASEL_7_8:  0x01,
        KASEL_6_8:  0x02,
        KASEL_5_8:  0x03,
        KASEL_4_8:  0x04,
        KASEL_3_8:  0x05,
        KASEL_2_8:  0x06,
        KASEL_1_8:  0x07,
        KASEL_1:    0x00,
        KASEL_3_4:  0x02,
        KASEL_1_2:  0x04,
        KASEL_1_4:  0x06,
        KASEL_K0_R: 0x10,
        KASEL_K1_R: 0x11,
        KASEL_K2_R: 0x12,
        KASEL_K3_R: 0x13,
        KASEL_K0_G: 0x14,
        KASEL_K1_G: 0x15,
        KASEL_K2_G: 0x16,
        KASEL_K3_G: 0x17,
        KASEL_K0_B: 0x18,
        KASEL_K1_B: 0x19,
        KASEL_K2_B: 0x1A,
        KASEL_K3_B: 0x1B,
        KASEL_K0_A: 0x1C,
        KASEL_K1_A: 0x1D,
        KASEL_K2_A: 0x1E,
        KASEL_K3_A: 0x1F,
    };
    static TevSwapSel = {
        SWAP0: 0,
        SWAP1: 1,
        SWAP2: 2,
        SWAP3: 3,
        MAX_TEVSWAP: 4,
    };
    static TevColorChan = {
        RED:   0,
        GREEN: 1,
        BLUE:  2,
        ALPHA: 3,
    };
    static AlphaOp = {
        AND:  0,
        OR:   1,
        XOR:  2,
        XNOR: 3,
        MAX_ALPHAOP: 4,
    };
    static TevScale = {
        SCALE_1:  0,
        SCALE_2:  1,
        SCALE_4:  2,
        DIVIDE_2: 3,
        MAX_TEVSCALE: 4,
    };
    static FogType = {
        GX_FOG_NONE:          0x00,
        GX_FOG_PERSP_LIN:     0x02,
        GX_FOG_PERSP_EXP:     0x04,
        GX_FOG_PERSP_EXP2:    0x05,
        GX_FOG_PERSP_REVEXP:  0x06,
        GX_FOG_PERSP_REVEXP2: 0x07,
        GX_FOG_ORTHO_LIN:     0x0A,
        GX_FOG_ORTHO_EXP:     0x0C,
        GX_FOG_ORTHO_EXP2:    0x0D,
        GX_FOG_ORTHO_REVEXP:  0x0E,
        GX_FOG_ORTHO_REVEXP2: 0x0F,
        // For compatibility with former versions
        GX_FOG_LIN:           0x02, //GX_FOG_PERSP_LIN,
        GX_FOG_EXP:           0x04, //GX_FOG_PERSP_EXP,
        GX_FOG_EXP2:          0x05, //GX_FOG_PERSP_EXP2,
        GX_FOG_REVEXP:        0x06, //GX_FOG_PERSP_REVEXP,
        GX_FOG_REVEXP2:       0x07, //GX_FOG_PERSP_REVEXP2
    };
    static BlendMode = {
        NONE:     0x0,
        BLEND:    0x1,
        LOGIC:    0x2,
        SUBTRACT: 0x3,
    };
    static BlendFactor = {
        ZERO:        0x0,
        ONE:         0x1,
        SRCCLR:      0x2,
        INVSRCCLR:   0x3,
        SRCALPHA:    0x4,
        INVSRCALPHA: 0x5,
        DSTALPHA:    0x6,
        INVDSTALPHA: 0x7,
    };
    static Compare = {
        NEVER:   0x0,
        LESS:    0x1,
        EQUAL:   0x2,
        LEQUAL:  0x3,
        GREATER: 0x4,
        NEQUAL:  0x5,
        GEQUAL:  0x6,
        ALWAYS:  0x7,
    };
    static LogicOp = {
        CLEAR:   0x0,
        AND:     0x1,
        REVAND:  0x2,
        COPY:    0x3,
        INVAND:  0x4,
        NOOP:    0x5,
        XOR:     0x6,
        OR:      0x7,
        NOR:     0x8,
        EQUIV:   0x9,
        INV:     0xa,
        REVOR:   0xb,
        INVCOPY: 0xc,
        INVOR:   0xd,
        NAND:    0xe,
        SET:     0xf,
    };
    static PixelFmt = {
        RGB8_Z24:   0,
        RGBA6_Z24:  1,
        RGB565_Z16: 2,
        Z24:        3,
        Y8:         4,
        U8:         5,
        V8:         6,
        YUV420:     7,
    };
    static ZFmt16 = {
        LINEAR: 0,
        NEAR:   1,
        MID:    2,
        FAR:    3,
    };
    static TevMode = {
        MODULATE: 0,
        DECAL:    1,
        BLEND:    2,
        REPLACE:  3,
        PASSCLR:  4,
    };
    static Gamma = {
        GM_1_0: 0,
        GM_1_7: 1,
        GM_2_2: 2,
    };
    static ProjectionType = {
        PERSPECTIVE:  0,
        ORTHOGRAPHIC: 1,
    };
    static Event = {
        VCACHE_MISS_ALL: 0,
        VCACHE_MISS_POS: 1,
        VCACHE_MISS_NRM: 2,
    };
    static FBClamp = {
        CLAMP_NONE:   0,
        CLAMP_TOP:    1,
        CLAMP_BOTTOM: 2,
    };
    static Anisotropy = {
        ANISO_1: 0,
        ANISO_2: 1,
        ANISO_4: 2,
        MAX_ANISOTROPY: 3,
    };
    static ZTexOp = {
        DISABLE:    0,
        ADD:        1,
        REPLACE:    2,
        MAX_ZTEXOP: 3,
    };
    static AlphaReadMode = {
        READ_00:   0,
        READ_FF:   1,
        READ_NONE: 2,
    };
    static Perf0 = {
        VERTICES:            0x00,
        CLIP_VTX:            0x01,
        CLIP_CLKS:           0x02,
        XF_WAIT_IN:          0x03,
        XF_WAIT_OUT:         0x04,
        XF_XFRM_CLKS:        0x05,
        XF_LIT_CLKS:         0x06,
        XF_BOT_CLKS:         0x07,
        XF_REGLD_CLKS:       0x08,
        XF_REGRD_CLKS:       0x09,
        CLIP_RATIO:          0x0A,
        TRIANGLES:           0x0B,
        TRIANGLES_CULLED:    0x0C,
        TRIANGLES_PASSED:    0x0D,
        TRIANGLES_SCISSORED: 0x0E,
        TRIANGLES_0TEX:      0x0F,
        TRIANGLES_1TEX:      0x10,
        TRIANGLES_2TEX:      0x11,
        TRIANGLES_3TEX:      0x12,
        TRIANGLES_4TEX:      0x13,
        TRIANGLES_5TEX:      0x14,
        TRIANGLES_6TEX:      0x15,
        TRIANGLES_7TEX:      0x16,
        TRIANGLES_8TEX:      0x17,
        TRIANGLES_0CLR:      0x18,
        TRIANGLES_1CLR:      0x19,
        TRIANGLES_2CLR:      0x1A,
        QUAD_0CVG:           0x1B,
        QUAD_NON0CVG:        0x1C,
        QUAD_1CVG:           0x1D,
        QUAD_2CVG:           0x1E,
        QUAD_3CVG:           0x1F,
        QUAD_4CVG:           0x20,
        AVG_QUAD_CNT:        0x21,
        CLOCKS:              0x22,
        NONE:                0x23,
    };
    static Perf1 = {
        TEXELS:           0x00,
        TX_IDLE:          0x01,
        TX_REGS:          0x02,
        TX_MEMSTALL:      0x03,
        TC_CHECK1_2:      0x04,
        TC_CHECK3_4:      0x05,
        TC_CHECK5_6:      0x06,
        TC_CHECK7_8:      0x07,
        TC_MISS:          0x08,
        VC_ELEMQ_FULL:    0x09,
        VC_MISSQ_FULL:    0x0A,
        VC_MEMREQ_FULL:   0x0B,
        VC_STATUS7:       0x0C,
        VC_MISSREP_FULL:  0x0D,
        VC_STREAMBUF_LOW: 0x0E,
        VC_ALL_STALLS:    0x0F,
        VERTICES:         0x10,
        FIFO_REQ:         0x11,
        CALL_REQ:         0x12,
        VC_MISS_REQ:      0x13,
        CP_ALL_REQ:       0x14,
        CLOCKS:           0x15,
        NONE:             0x16,
    };
    static VCachePerf = {
        POS:  0x0,
        NRM:  0x1,
        CLR0: 0x2,
        CLR1: 0x3,
        TEX0: 0x4,
        TEX1: 0x5,
        TEX2: 0x6,
        TEX3: 0x7,
        TEX4: 0x8,
        TEX5: 0x9,
        TEX6: 0xA,
        TEX7: 0xB,
        ALL:  0xF,
    };
    static CopyMode = {
        PROGRESSIVE: 0,
        INTLC_EVEN:  2,
        INTLC_ODD:   3,
    };
    static MiscToken = {
        XF_FLUSH:           1,
        DL_SAVE_CONTEXT:    2,
        ABORT_WAIT_COPYOUT: 3,
        NULL:               0,
    };
    static XFFlushVal = {
        NONE: 0,
        SAFE: 8,
    };

    constructor(context) {
        this.context = context;
        this.gl      = context.gl;
        this._buildGlTables();
        //used for when we want an invisible texture (eg to fill unused
        //texture slots)
        this.blankTexture = new Texture(context);
        this.blankTexture.makeSolidColor(255, 0, 255, 0);
        //used for when we want a plain white texture (eg to render polygons
        //without any textures)
        this.whiteTexture = new Texture(context);
        this.whiteTexture.makeSolidColor(255, 255, 255, 255);
        //used for when a texture can't be loaded.
        this.missingTexture = new Texture(context);
        this.missingTexture.loadFromImage('/r/missing-texture.png');
        //if changing this we need to also add more samplers in the fragment
        //shader and update loadPrograms()
        this.MAX_TEXTURES = 2;
        //this.bp           = new BP(this);
        this.cp           = new CP(this);
        this.xf           = new XF(this);
        this.vtxBuf       = new VertexBuffer(this);
        this.dlistParser  = new DlistParser(this);
        this.pickerObjs   = []; //idx => obj
    }

    _buildGlTables() {
        const gl = this.gl;
        this.BlendFactorMap = {
            [GX.BlendFactor.ZERO]:        gl.ZERO,
            [GX.BlendFactor.ONE]:         gl.ONE,
            [GX.BlendFactor.SRCCLR]:      gl.SRC_COLOR,
            [GX.BlendFactor.INVSRCCLR]:   gl.ONE_MINUS_SRC_COLOR,
            [GX.BlendFactor.SRCALPHA]:    gl.SRC_ALPHA,
            [GX.BlendFactor.INVSRCALPHA]: gl.ONE_MINUS_SRC_ALPHA,
            [GX.BlendFactor.DSTALPHA]:    gl.DST_ALPHA,
            [GX.BlendFactor.INVDSTALPHA]: gl.ONE_MINUS_DST_ALPHA,
        };
        this.CompareModeMap = {
            [GX.Compare.NEVER]:   gl.NEVER,
            [GX.Compare.LESS]:    gl.LESS,
            [GX.Compare.EQUAL]:   gl.EQUAL,
            [GX.Compare.LEQUAL]:  gl.LEQUAL,
            [GX.Compare.GREATER]: gl.GREATER,
            [GX.Compare.NEQUAL]:  gl.NOTEQUAL,
            [GX.Compare.GEQUAL]:  gl.GEQUAL,
            [GX.Compare.ALWAYS]:  gl.ALWAYS,
        };
    }

    reset() {
        /** Reset all state to default.
         */
        const gl = this.gl;
        //this.bp.reset();
        this.cp.reset();
        this.xf.reset();
        this.vtxBuf.clear();
        this.program.use();
        this.gl.uniform1i(this.programInfo.uniforms.useId, 0);
        this.gl.uniform1i(this.programInfo.uniforms.useLights,
            this.context.lights.enabled ? 1 : 0);
        this.gl.uniform1i(this.programInfo.uniforms.useTexture,
            this.context.enableTextures ? 1 : 0);

        this.alphaComp0 = GX.Compare.GREATER;
        this.alphaRef0  = 0;
        this.alphaOp    = GX.AlphaOp.AND;
        this.alphaComp1 = GX.Compare.GREATER;
        this.alphaRef1  = 0;
    }

    async loadPrograms() {
        /** Download and set up the shader programs. */
        const gl = this.gl;

        //get shader code and create program
        const path = '/r/js/app/ui/gl/gx';
        this.program = new Program(this.context, {
            [gl.VERTEX_SHADER]:   (await get(`${path}/vertex.glsl`))  .responseText,
            [gl.FRAGMENT_SHADER]: (await get(`${path}/fragment.glsl`)).responseText,
        });
        CHECK_ERROR(gl);

        //get program info, used to set variables
        const getAttr = (name) => {
            const r = this.program.getAttribLocation(name);
            //console.assert(r);
            return r;
        };
        const getUni = (name) => {
            const r = this.program.getUniformLocation(name);
            //console.assert(r);
            return r;
        };
        this.programInfo = {
            program: this.program,
            attribs: {
                POS:      getAttr('in_POS'),
                NRM:      getAttr('in_NRM'),
                COL0:     getAttr('in_COL0'),
                TEX0:     getAttr('in_TEX0'),
                PNMTXIDX: getAttr('in_PNMTXIDX'),
                //T0MIDX:   getAttr('in_T0MIDX'),
                id:       getAttr('in_ID'),
            },
            uniforms: {
                matProjection: getUni('u_matProjection'),
                matModelView:  getUni('u_matModelView'),
                matNormal:     getUni('u_matNormal'),
                useId:         getUni('u_useId'),
                useTexture:    getUni('u_useTexture'),
                useAlphaTest:  getUni('u_useAlphaTest'),
                ambLightColor: getUni('u_ambLightColor'),
                dirLightColor: getUni('u_dirLightColor'),
                dirLightVector:getUni('u_dirLightVector'),
                matPos:        getUni('u_matPos'),
                matNrm:        getUni('u_matNrm'),
                matTex:        getUni('u_matTex'),
                uSampler: [
                    getUni('u_texture0'),
                    getUni('u_texture1'),
                ],
                alphaComp0: getUni('u_alphaComp0'),
                alphaRef0:  getUni('u_alphaRef0'),
                alphaComp1: getUni('u_alphaComp1'),
                alphaRef1:  getUni('u_alphaRef1'),
                alphaOp:    getUni('u_alphaOp'),
            },
        };
        CHECK_ERROR(gl);
        console.log("GX loadPrograms OK");
    }

    beginRender(mtxs, isPicker=false) {
        /** Reset render state for new frame.
         *  @param {object} mtxs A dict of matrices to set.
         *  @param {bool} isPicker Whether we're rendering to the pick buffer.
         */
        const gl = this.gl;
        this._isDrawingForPicker = isPicker;

        //this.program.use();
        //const unif = this.programInfo.uniforms;
        //console.log("PROGRAM INFO", this.programInfo);
        this.syncSettings(mtxs);
        this.syncXF();
    }

    syncSettings(mtxs) {
        /** Upload various render settings to the GPU. */
        const gl = this.gl;
        this.program.use();
        const unif = this.programInfo.uniforms;

        //reset lights to whatever the user set.
        gl.uniform3iv(unif.ambLightColor,
            this.context.lights.ambient.color);
        gl.uniform3iv(unif.dirLightColor,
            this.context.lights.directional.color);
        gl.uniform3fv(unif.dirLightVector,
            this.context.lights.directional.vector);

        gl.uniform1i(unif.useId, this._isDrawingForPicker ? 1 : 0);
        gl.uniform1i(unif.useLights,
            this.context.lights.enabled ? 1 : 0);
        gl.uniform1i(unif.useTexture,
            this.context.enableTextures ? 1 : 0);

        gl.uniform1i(unif.alphaComp0, this.alphaComp0);
        gl.uniform1f(unif.alphaRef0,  this.alphaRef0);
        gl.uniform1i(unif.alphaOp,    this.alphaOp);
        gl.uniform1i(unif.alphaComp1, this.alphaComp1);
        gl.uniform1f(unif.alphaRef1,  this.alphaRef1);

        gl.uniformMatrix4fv(unif.matProjection, false, mtxs.projection);
        gl.uniformMatrix4fv(unif.matModelView,  false, mtxs.modelView);
        gl.uniformMatrix4fv(unif.matNormal,     false, mtxs.normal);
    }

    syncXF() {
        /** Upload the XF matrix data to the GPU. */
        //XXX optimize by not uploading it all every time
        const gl = this.gl;
        this.program.use();
        const unif = this.programInfo.uniforms;
        console.log(" *** SYNC XF");

        /*let mData = [];
        for(let n=0; n<256; n += 16) {
            let lines = [];
            for(let r=0; r<3; r++) {
                let line = [];
                for(let c=0; c<4; c++) {
                    line.push(this.xf._reg[(r*4)+c+n].toFixed(5)
                        .padStart(9));
                }
                lines.push(line.join(', '));
            }
            mData.push(lines.join(',\n'));
        }
        console.log("Upload matrix data", this.xf, mData);*/
        gl.uniform4fv(unif.matPos, this.xf._reg.slice(0, 256));
        //gl.uniform4fv(unif.matPos, this.xf._reg, 0x000, 0x100);
        //gl.uniform3fv(unif.matNrm, this.xf._reg, 0x400, 0x060);
        //gl.uniform4fv(unif.matTex, this.xf._reg, 0x500, 0x100);
    }

    setModelViewMtx(mtx) {
        this.gl.uniformMatrix4fv(this.programInfo.uniforms.matModelView,
            false, mtx);
    }

    executeBatch(batch) {
        /** Execute render batch.
         *  @param {RenderBatch} batch Render batch to execute.
         */
        const stats = batch.execute(this.programInfo);
        for(let [k,v] of Object.entries(stats)) {
            if(this.context.stats[k] == undefined) {
                this.context.stats[k] = v;
            }
            else this.context.stats[k] += v;
        }
        const gb = this.context.stats.geomBounds;
        gb.xMin = Math.min(gb.xMin, batch.geomBounds.xMin);
        gb.xMax = Math.max(gb.xMax, batch.geomBounds.xMax);
        gb.yMin = Math.min(gb.yMin, batch.geomBounds.yMin);
        gb.yMax = Math.max(gb.yMax, batch.geomBounds.yMax);
        gb.zMin = Math.min(gb.zMin, batch.geomBounds.zMin);
        gb.zMax = Math.max(gb.zMax, batch.geomBounds.zMax);
    }

    resetPicker() {
        this.pickerObjs = [];
    }
    addPickerObj(obj) {
        this.pickerObjs.push(obj);
        return this.pickerObjs.length - 1;
    }
    getPickerObj(idx) {
        return this.pickerObjs[idx];
    }

    setBlendMode(blendMode, srcFactor, destFactor, logicOp) {
        /** Implement GC SDK's gxSetBlendMode().
         *  @param {BlendMode} blendMode blend mode.
         *  @param {BlendFactor} srcFactor source blend factor.
         *  @param {BlendFactor} destFactor destination blend factor.
         *  @param {LogicOp} logicOp how to blend.
         */
        if(this._isDrawingForPicker) return;
        const gl = this.gl;
        gl.blendFunc(this.BlendFactorMap[srcFactor],
            this.BlendFactorMap[destFactor]);
        switch(blendMode) {
            case GX.BlendMode.NONE:
                gl.disable(gl.BLEND);
                break;
            case GX.BlendMode.BLEND:
                gl.enable(gl.BLEND);
                gl.blendEquation(gl.FUNC_ADD);
                break;
            case GX.BlendMode.LOGIC:
                gl.enable(gl.BLEND);
                //XXX bizarrely, fragment shaders can't read from the frame
                //buffer they're about to modify, so we can't implement
                //the various logic blend modes correctly.
                //for now we'll use this as a placeholder. should investigate
                //how Dolphin manages this. (probably glLogicOp)
                gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
                break;
            case GX.BlendMode.SUBTRACT:
                gl.enable(gl.BLEND);
                gl.blendEquation(gl.FUNC_SUBTRACT);
                break;
            default: throw new Error("Invalid blend mode");
        }
    }

    setZMode(compareEnable, compareFunc, updateEnable) {
        /** Implement GC SDK's gxSetZMode().
         *  @param {bool} compareEnable Whether to use depth compare.
         *  @param {GXCompare} compareFunc Compare function to use.
         *  @param {bool} updateEnable Whether to update Z buffer.
         */
        const gl = this.gl;
        if(compareEnable) gl.enable(gl.DEPTH_TEST);
        else gl.disable(gl.DEPTH_TEST);
        gl.depthFunc(this.CompareModeMap[compareFunc]);
        gl.depthMask(updateEnable);
    }

    setAlphaCompare(comp0, ref0, op, comp1, ref1) {
        //console.log("setAlphaCompare", comp0, ref0, op, comp1, ref1);
        //if(ref0 == 4 || ref0 == 7) debugger;
        this.alphaComp0 = comp0;
        this.alphaRef0  = ref0 / 255.0;
        this.alphaOp    = op;
        this.alphaComp1 = comp1;
        this.alphaRef1  = ref1 / 255.0;
    }

    setZCompLoc(loc) {
        //Z compare location = loc ? before tex : after tex
        //XXX
        console.warn("Not implemented: GX.setZCompLoc");
    }

    setChanCtrl(chan, enable, amb_src, mat_src, light_mask, diff_fn, attn_fn) {
        /**
        * @param {ChannelID} chan
        * @param {Bool}      enable
        * @param {ColorSrc}  amb_src
        * @param {ColorSrc}  mat_src
        * @param {u32}       light_mask
        * @param {DiffuseFn} diff_fn
        * @param {AttnFn}    attn_fn
        */
       //XXX
       //this is about lights, don't care right now
       console.warn("Not implemented: GX.setChanCtrl");
    }

    setCullMode(mode) {
        const gl = this.gl;
        switch(mode) {
            case GX.CullMode.NONE:
                gl.disable(gl.CULL_FACE);
                break;
            case GX.CullMode.FRONT:
                gl.enable(gl.CULL_FACE);
                gl.cullFace(gl.FRONT);
                break;
            case GX.CullMode.BACK:
                gl.enable(gl.CULL_FACE);
                gl.cullFace(gl.BACK);
                break;
            case GX.CullMode.ALL:
                gl.enable(gl.CULL_FACE);
                gl.cullFace(gl.FRONT_AND_BACK);
                break;
        }
    }

    setUseAlphaTest(enable) {
        //XXX find the corresponding SDK method
        this.gl.uniform1i(this.programInfo.uniforms.useAlphaTest,
            enable ? 1 : 0);
    }

    disableTextures(blendMode=GX.BlendMode.BLEND, cull=true) {
        /** Disable textures and change blending and culling params.
         *  Used for various non-textured rendering such as collision meshes.
         *  @param {GX.BlendMode} blendMode Which blending mode to use.
         *  @param {bool} cull Whether to use backface culling.
         */
        const gl = this.gl;
        this.setBlendMode(blendMode, GX.BlendFactor.SRCALPHA,
            GX.BlendFactor.INVSRCALPHA, GX.LogicOp.NOOP);
        if(cull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
        for(let i=0; i<this.MAX_TEXTURES; i++) {
            gl.activeTexture(gl.TEXTURE0 + i);
            this.whiteTexture.bind();
            gl.uniform1i(this.programInfo.uniforms.uSampler[i], i);
        }
    }

    _setShaderMtxs() {
        /** Send the current projection, modelview, and normal matrices
         *  to the shaders.
         */
        const gl = this.gl;
        gl.uniformMatrix4fv(this.programInfo.uniforms.matProjection,
            false, this.context.matProjection);
        gl.uniformMatrix4fv(this.programInfo.uniforms.matModelView,
            false, this.context.matModelView);
        gl.uniformMatrix4fv(this.programInfo.uniforms.matNormal,
            false, this.context.matNormal);
        //console.log("mtxs: proj", this.context.matProjection,
        //    "modelview", this.context.matNormal,
        //    "normal", this.context.matNormal);
    }
}
