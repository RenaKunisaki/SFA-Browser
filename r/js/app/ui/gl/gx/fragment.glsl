#version 300 es
/** Fragment shader for GX.
 */
precision mediump float;

//inputs from previous stage
in vec4 vtx_Color;    //vertex color
in vec3 vtx_LightColor; //light color
in vec2 vtx_TexCoord; //texture coord
flat in uint  vtx_Id;       //ID for picker

//textures
uniform sampler2D u_texture0; //texture 0
uniform sampler2D u_texture1; //texture 1

//settings
uniform bool  u_useId;        //are we rendering for picker?
uniform bool  u_useLights;    //enable lighting?
uniform bool  u_useTexture;   //enable textures?
uniform bool  u_useAlphaTest; //discard texels at 0 alpha?
uniform int   u_alphaComp0, u_alphaComp1; //alpha compare op
uniform float u_alphaRef0,  u_alphaRef1; //alpha compare RHS
uniform int   u_alphaOp; //alpha compare mid op

//outputs
out vec4 out_Color; //fragment color

void main() {
    vec4 tex0 = texture(u_texture0, vtx_TexCoord);
    vec4 tex1 = texture(u_texture1, vtx_TexCoord);
    vec4 col;
    if(u_useTexture) col = mix(tex0, tex1, (1.0-tex0.a) * tex1.a) * vtx_Color;
    else col = vtx_Color;
    if(u_useLights) col = vec4(col.rgb * vtx_LightColor, col.a);
    if(u_useId) {
        //render for picker buffer. vertex color = its ID.
        out_Color = vec4(
            float( int(vtx_Id) >> 24) / 255.0,
            //gl_FragCoord.y / 1024.0,
            float((int(vtx_Id) >> 16) & 0xFF) / 255.0,
            float((int(vtx_Id) >>  8) & 0xFF) / 255.0,
            float( int(vtx_Id)        & 0xFF) / 255.0);
    }
    else if(!u_useAlphaTest) out_Color = col.rgba;
    else {
        int a0, a1, cond;
        switch(u_alphaComp0) {
            case 0x1: a0 = (col.a <  u_alphaRef0) ? 1 : 0; break; //LESS
            case 0x2: a0 = (col.a == u_alphaRef0) ? 1 : 0; break; //EQUAL
            case 0x3: a0 = (col.a <= u_alphaRef0) ? 1 : 0; break; //LEQUAL
            case 0x4: a0 = (col.a >  u_alphaRef0) ? 1 : 0; break; //GREATER
            case 0x5: a0 = (col.a != u_alphaRef0) ? 1 : 0; break; //NEQUAL
            case 0x6: a0 = (col.a >= u_alphaRef0) ? 1 : 0; break; //GEQUAL
            case 0x7: a0 = 1; break; //ALWAYS
            default:  a0 = 0; break; //NEVER
        }
        switch(u_alphaComp1) {
            case 0x1: a1 = (col.a <  u_alphaRef1) ? 1 : 0; break; //LESS
            case 0x2: a1 = (col.a == u_alphaRef1) ? 1 : 0; break; //EQUAL
            case 0x3: a1 = (col.a <= u_alphaRef1) ? 1 : 0; break; //LEQUAL
            case 0x4: a1 = (col.a >  u_alphaRef1) ? 1 : 0; break; //GREATER
            case 0x5: a1 = (col.a != u_alphaRef1) ? 1 : 0; break; //NEQUAL
            case 0x6: a1 = (col.a >= u_alphaRef1) ? 1 : 0; break; //GEQUAL
            case 0x7: a1 = 1; break; //ALWAYS
            default:  a1 = 0; break; //NEVER
        }
        switch(u_alphaOp) {
            case 0:  cond =  a0 & a1; break; //AND
            case 1:  cond =  a0 | a1; break; //OR
            case 2:  cond =  a0 ^ a1; break; //XOR
            default: cond = (a0 ^ a1) ^ 1; break; //XNOR
        }
        if(cond == 0) discard;
        else out_Color = col.rgba;
    }
}
