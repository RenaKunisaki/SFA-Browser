#version 300 es
/** Vertex shader for GX.
 */
//inputs from CPU
//if changing these you must also change
//programInfo in GX.js
in vec3 in_POS;  //vertex position
in vec3 in_NRM;  //vertex normal
in vec4 in_COL0; //vertex color
in vec2 in_TEX0; //texture coord
in int in_PNMTXIDX; //position/normal matrix idx
//in uint in_T0MIDX; //texture matrix idx
in uint in_ID;   //ID for picker

//uniforms
uniform mat4  u_matModelView;   //modelview matrix
uniform mat4  u_matProjection;  //projection matrix
uniform mat4  u_matNormal;      //normal matrix
uniform ivec3 u_ambLightColor;  //ambient light color
uniform ivec3 u_dirLightColor;  //directional light color
uniform vec3  u_dirLightVector; //directional light direction vector

//uniforms for matrix processor
//this is implemented as a few big arrays of floats, where
//indices are multiplied by 4, not 16, which means matrices
//can in theory overlap in memory. we deal with this by
//making these arrays of vecN rather than matN and constructing
//the actual matrices on the fly.
uniform vec4 u_matPos[64]; //position matrix
uniform vec3 u_matNrm[32]; //normal matrix
uniform vec4 u_matTex[64]; //texture matrix

//outputs to next stage
out vec4 vtx_Color;      //vertex color
out vec3 vtx_LightColor; //light color output
out vec2 vtx_TexCoord;   //texture coord
flat out uint  vtx_Id;   //ID for picker

void main() {
    //position gets fed through matrices
    mat4 pnmtx;
    if(in_PNMTXIDX < 0) {
        pnmtx[0] = vec4(1.0, 0.0, 0.0, 0.0);
        pnmtx[1] = vec4(0.0, 1.0, 0.0, 0.0);
        pnmtx[2] = vec4(0.0, 0.0, 1.0, 0.0);
    }
    else {
        for(int i=0; i<3; i++) {
            //assign an entire vec4 per iteration
            pnmtx[i] = u_matPos[in_PNMTXIDX+i];
        }
    }
    pnmtx[3] = vec4(0.0, 0.0, 0.0, 1.0);
    //pnmtx = transpose(pnmtx);

    gl_Position = u_matProjection * u_matModelView * (
        vec4(in_POS.xyz, 1.0) * pnmtx
        //pnmtx * vec4(in_POS.xyz, 1.0)
    );
    //gl_PointSize = 4.0;

    //color gets normalized
    vtx_Color = vec4(in_COL0.r/255.0, in_COL0.g/255.0,
        in_COL0.b/255.0, in_COL0.a/255.0);
    //vtx_Color = vec4(u_matPos[1].rgb, 1.0);
    //vtx_Color = vec4(float(in_PNMTXIDX) * 4.0, 1.0, 1.0, 1.0);

    //texcoord gets fed through matrices
    /*mat4 texmtx;
    for(uint i=0u; i<16u; i++) {
        texmtx[i] = u_matTex[(in_T0MIDX*4u)+i];
    }*/
    vtx_TexCoord = in_TEX0; // * texmtx;

    //these just pass through
    vtx_Id = in_ID;

    //normalize the light vectors
    vec3 ambientLight = vec3(
        float(u_ambLightColor.r) / 255.0,
        float(u_ambLightColor.g) / 255.0,
        float(u_ambLightColor.b) / 255.0);
    vec3 directionalLightColor = vec3(
        float(u_dirLightColor.r) / 255.0,
        float(u_dirLightColor.g) / 255.0,
        float(u_dirLightColor.b) / 255.0);
    vec3 directionalVector = normalize(u_dirLightVector);

    //compute this vertex's light color
    vec4 transformedNormal = u_matNormal * vec4(in_NRM, 1.0) * pnmtx;
    float directional = max(dot(transformedNormal.xyz, directionalVector), 0.0);
    vtx_LightColor = ambientLight + (directionalLightColor * directional);
}
