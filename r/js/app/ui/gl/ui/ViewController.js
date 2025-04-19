import { E } from "../../../../lib/Element.js";
const PI_OVER_180 = Math.PI / 180.0; //rad = deg * PI_OVER_180

const DEG2RAD = (x) => (x*PI_OVER_180);
const RAD2DEG = (x) => (x/PI_OVER_180);
const CLAMP_DEGREES = r => {
    while(r < 0) r += 360;
    return r % 360;
};
const CLAMP_RADIANS = (x) => {
    x %= Math.PI * 2;
    if(x < 0) x += Math.PI * 2;
    return x;
};

let _nextId=0;

/** Controls the "camera" of a GL context. */
export default class ViewController {
    constructor(context) {
        this.context = context;
        this._createElements();
    }

    /** Manually change parameters.
     */
    set(params) {
        //XXX this doesn't always reflect the actual values. eg if we rotate
        //enough the actual rotation value can be -1 but we'll be displaying
        //it as 359. not a huge problem but could become one if something
        //expects these to display the real values...
        const R = Math.round;
        if(params.pos) {
            if(params.pos.x != undefined) this.txtPosX.value = R(params.pos.x);
            if(params.pos.y != undefined) this.txtPosY.value = R(params.pos.y);
            if(params.pos.z != undefined) this.txtPosZ.value = R(params.pos.z);
        }
        if(params.rot) {
            if(params.rot.x != undefined) this.txtRotX.value = CLAMP_DEGREES(params.rot.x);
            if(params.rot.y != undefined) this.txtRotY.value = CLAMP_DEGREES(params.rot.y);
            if(params.rot.z != undefined) this.txtRotZ.value = CLAMP_DEGREES(params.rot.z);
        }
        if(params.scale) {
            if(params.scale.x != undefined) this.txtScaleX.value = params.scale.x;
            if(params.scale.y != undefined) this.txtScaleY.value = params.scale.y;
            if(params.scale.z != undefined) this.txtScaleZ.value = params.scale.z;
        }
        if(params.zNear != undefined) this.txtZNear.value = params.zNear;
        if(params.zFar  != undefined) this.txtZFar .value = params.zFar;
        if(params.fov   != undefined) this.txtFov  .value = params.fov;
        if(params.enableTextures != undefined) {
            this.chkEnableTex.checked = params.enableTextures;
        }
        if(params.useWireframe != undefined) {
            this.chkWireframe.checked = params.useWireframe;
        }
        if(params.enableBackfaceCulling != undefined) {
            this.chkEnableBackface.checked = params.enableBackfaceCulling;
        }
        if(params.showPickBuffer != undefined) {
            this.chkShowPickBuffer.checked = params.showPickBuffer;
        }
        if(params.useOrtho != undefined) {
            this.chkOrtho.checked = params.useOrtho;
        }
        if(params.frontFaceCW != undefined) {
            this.btnFrontFaceCW .checked =  params.frontFaceCW;
            this.btnFrontFaceCCW.checked = !params.frontFaceCW;
        }
        if(params.useSRT != undefined) {
            this.btnRotateCam.checked =  params.useSRT;
            this.btnRotateOrg.checked = !params.useSRT;
        }
        if(params.moveSpeed != undefined) {
            this.txtMoveSpeed.value = params.moveSpeed;
        }
        this._onChange(null); //trigger an update
    }

    /** Read parameters. */
    get() {
        const F = parseFloat;
        return {
            pos: {
                x:F(this.txtPosX.value),
                y:F(this.txtPosY.value),
                z:F(this.txtPosZ.value),
            },
            rot: {
                x:F(this.txtRotX.value),
                y:F(this.txtRotY.value),
                z:F(this.txtRotZ.value),
            },
            scale: {
                x:F(this.txtScaleX.value),
                y:F(this.txtScaleY.value),
                z:F(this.txtScaleZ.value),
            },
            zNear: F(this.txtZNear.value),
            zFar:  F(this.txtZFar .value),
            fov:   F(this.txtFov  .value),
            enableTextures: this.chkEnableTex.checked,
            useWireframe: this.chkWireframe.checked,
            enableBackfaceCulling: this.chkEnableBackface.checked,
            showPickBuffer: this.chkShowPickBuffer.checked,
            useOrtho: this.chkOrtho.checked,
            frontFaceCW: this.btnFrontFaceCW.checked,
            useSRT: this.btnRotateCam.checked,
            moveSpeed: F(this.txtMoveSpeed.value),
        };
    }

    get pos() {
        return {
            x:parseFloat(this.txtPosX.value),
            y:parseFloat(this.txtPosY.value),
            z:parseFloat(this.txtPosZ.value),
        };
    }
    set pos(val) {
        this.txtPosX.value = val.x;
        this.txtPosY.value = val.y;
        this.txtPosZ.value = val.z;
        this._onChange(null); //trigger an update
    }
    get rot() {
        return {
            x:parseFloat(this.txtRotX.value),
            y:parseFloat(this.txtRotY.value),
            z:parseFloat(this.txtRotZ.value),
        };
    }
    set rot(val) {
        this.txtRotX.value = CLAMP_DEGREES(val.x);
        this.txtRotY.value = CLAMP_DEGREES(val.y);
        this.txtRotZ.value = CLAMP_DEGREES(val.z);
        this._onChange(null); //trigger an update
    }
    get scale() {
        return {
            x:parseFloat(this.txtScaleX.value),
            y:parseFloat(this.txtScaleY.value),
            z:parseFloat(this.txtScaleZ.value),
        };
    }
    set scale(val) {
        this.txtScaleX.value = val.x;
        this.txtScaleY.value = val.y;
        this.txtScaleZ.value = val.z;
        this._onChange(null); //trigger an update
    }

    /** Add to parameters. */
    adjust(params) {
        const F = parseFloat;
        if(params.pos) {
            if(params.pos.x != undefined) this.txtPosX.value = F(this.txtPosX.value)+params.pos.x;
            if(params.pos.y != undefined) this.txtPosY.value = F(this.txtPosY.value)+params.pos.y;
            if(params.pos.z != undefined) this.txtPosZ.value = F(this.txtPosZ.value)+params.pos.z;
        }
        if(params.rot) {
            if(params.rot.x != undefined) this.txtRotX.value = F(this.txtRotX.value)+params.rot.x;
            if(params.rot.y != undefined) this.txtRotY.value = F(this.txtRotY.value)+params.rot.y;
            if(params.rot.z != undefined) this.txtRotZ.value = F(this.txtRotZ.value)+params.rot.z;
        }
        if(params.scale) {
            if(params.scale.x != undefined) this.txtScaleX.value = F(this.txtScaleX.value)+params.scale.x;
            if(params.scale.y != undefined) this.txtScaleY.value = F(this.txtScaleY.value)+params.scale.y;
            if(params.scale.z != undefined) this.txtScaleZ.value = F(this.txtScaleZ.value)+params.scale.z;
        }
        if(params.zNear != undefined) this.txtZNear.value = F(this.txtZNear.value) + params.zNear;
        if(params.zFar  != undefined) this.txtZFar .value = F(this.txtZFar .value) + params.zFar;
        if(params.fov   != undefined) this.txtFov  .value = F(this.txtFov  .value) + params.fov;
        if(params.enableTextures != undefined) {
            this.chkEnableTex.checked = params.enableTextures;
        }
        if(params.useWireframe != undefined) {
            this.chkWireframe.checked = params.useWireframe;
        }
        if(params.enableBackfaceCulling != undefined) {
            this.chkEnableBackface.checked = params.enableBackfaceCulling;
        }
        if(params.showPickBuffer != undefined) {
            this.chkShowPickBuffer.checked = params.showPickBuffer;
        }
        if(params.useOrtho != undefined) {
            this.chkOrtho.checked = params.useOrtho;
        }
        if(params.frontFaceCW != undefined) {
            this.btnFrontFaceCW .checked =  params.frontFaceCW;
            this.btnFrontFaceCCW.checked = !params.frontFaceCW;
        }
        if(params.useSRT != undefined) {
            this.btnRotateCam.checked =  params.useSRT;
            this.btnRotateOrg.checked = !params.useSRT;
        }
        if(params.moveSpeed != undefined) {
            this.txtMoveSpeed.value = F(this.txtMoveSpeed.value) + params.moveSpeed;
        }
        this._onChange(null); //trigger an update
    }

    reset() {
        this.txtPosX.value   =     0;
        this.txtPosY.value   =     0;
        this.txtPosZ.value   =    -1;
        this.txtScaleX.value =     1;
        this.txtScaleY.value =     1;
        this.txtScaleZ.value =     1;
        this.txtRotX.value   =     0;
        this.txtRotY.value   =     0;
        this.txtRotZ.value   =     0;
        this.txtFov.value    =    60;
        this.txtZNear.value  =   2.5;
        this.txtZFar.value   = 10000;
        this.txtMoveSpeed.value = 1.0;
        this.chkEnableTex.checked      = true;
        this.chkWireframe.checked      = false;
        this.chkEnableBackface.checked = true;
        this.chkShowPickBuffer.checked = false;
        this.chkOrtho.checked          = false;
        this.btnFrontFaceCW.checked    = true;
        this.btnFrontFaceCCW.checked   = false;
        this.btnRotateCam.checked      = true;
        this.btnRotateOrg.checked      = false;
        if(this.context._onResetCamera) this.context._onResetCamera();
        else this._onChange(null);
    }

    /** Move the camera to a point.
     *  @param {float} x X coordinate to move to.
     *  @param {float} y Y coordinate to move to.
     *  @param {float} z Z coordinate to move to.
     *  @param {float} radius How close to the point the camera should get.
     *  @param {float} time How many seconds the camera should take to
     *      reach the target point. (Can be zero)
     *  @param {float} rotX X rotation (radians) for camera to have when done.
     *  @param {float} rotY Y rotation (radians) for camera to have when done.
     *  @param {float} rotZ Z rotation (radians) for camera to have when done.
     *  @description Moves the camera toward the target point, and rotates
     *      it to look at that point. The movement is animated over the
     *      given amount of time, and the camera is placed within the
     *      given radius of the target point, pointed toward the target.
     *      If rotation values are given, uses them instead of pointing
     *      at the target point.
     */
    moveToPoint(x, y, z, radius=1, time=1.0,
        rotX=null, rotY=null, rotZ=null) {
        //get starting and ending positions
        let curPos = vec3.fromValues(this.pos.x, this.pos.y, this.pos.z);
        let tgtPos = vec3.fromValues(x, y, z);

        //adjust destination so that it's within some distance of the point.
        //here we're imagining the point is a sphere, and calculating
        //the nearest point on its surface.
        //this means we zoom *to* an object, not *into* it.
        let dstPos = tgtPos;
        if(radius > 0) {
            const dist = vec3.distance(curPos, tgtPos);
            dstPos = vec3.fromValues(
                tgtPos[0] + ((radius * (curPos[0]-tgtPos[0])) / dist),
                tgtPos[1], //+ ((radius * (curPos[1]-objPos[1])) / dist),
                tgtPos[2] + ((radius * (curPos[2]-tgtPos[2])) / dist),
            );
        }

        //calculate angle we need to be at to point to target
        let angleXZ  = Math.atan2(dstPos[2] - tgtPos[2], dstPos[0] - tgtPos[0]);
        angleXZ = CLAMP_RADIANS(angleXZ - (Math.PI / 2)); //no idea
        if(rotX !== null) angleXZ = rotX;
        const startXZ = CLAMP_RADIANS(DEG2RAD(this.rot.y));
        let   diffXZ  = CLAMP_RADIANS(angleXZ - startXZ);
        //console.log("rotX=", RAD2DEG(rotX), "angle", RAD2DEG(angleXZ),
        //    "diff", RAD2DEG(diffXZ));

        let startYZ = DEG2RAD(this.rot.x);
        let diffYZ  = -startYZ;
        if(rotY !== null) diffYZ += rotY;
        //XXX rotZ

        //don't do a full rotation if we don't have to.
        if(diffXZ  >= Math.PI) diffXZ = -((Math.PI * 2) - diffXZ);
        if(startYZ >= Math.PI) diffYZ =   (Math.PI * 2) + diffYZ;

        //maybe sometime when I'm not up too late already, I'll try to
        //have it do the minimal Y movement too instead of forcing to
        //the same height as the object...

        const isRotCam = this.btnRotateCam.checked;
        const tStart = performance.now();
        const tick = () => {
            const tNow = performance.now();
            const tDiff = Math.min(1, (tNow - tStart) / 1000); //msec -> sec

            let pos = vec3.create();
            let rx, ry;
            if(time <= 0) { //no lerping
                pos = dstPos;
                rx = startYZ + diffYZ;
                ry = startXZ + diffXZ;
            }
            else {
                const s = tDiff / time;
                vec3.lerp(pos, curPos, dstPos, s);
                rx = startYZ + (diffYZ * s);
                ry = startXZ + (diffXZ * s);
            }
            if(!isRotCam) {
                //if rotating around object we need to
                //invert the coordinates
                pos[0] = -pos[0];
                pos[1] = -pos[1];
                pos[2] = -pos[2];
            }
            this.set({
                pos: {x:pos[0], y:pos[1], z:pos[2]},
                rot: {x:RAD2DEG(rx), y:RAD2DEG(ry), z:0},
            });

            if(tDiff < time) requestAnimationFrame(tick);
        };
        tick();
    }

    /** Move the camera relative to its current
     *  position and rotation.
     *  @param {Object} vec Camera-relative movement vector.
     */
    moveByVector(vec) {
        const rx = ((this.rot.x % 360) - 180) * PI_OVER_180;
        const ry = ((this.rot.y % 360) - 180) * PI_OVER_180;

        const sinRX = Math.sin(rx);
        const cosRX = Math.cos(rx);
        const sinRY = Math.sin(ry);
        const cosRY = Math.cos(ry);

        const deltaX = ((vec.x * cosRY) - (vec.y * sinRY));
        const deltaY = vec.y * sinRX;
        const deltaZ = ((vec.x * sinRY) + (vec.y * cosRY));

        this.adjust({ pos: {
            x: deltaX, y: deltaY, z: deltaZ } });
    }

    _onChange(event) {
        const F = parseFloat;
        this.context.view.pos.x      = F(this.txtPosX.value);
        this.context.view.pos.y      = F(this.txtPosY.value);
        this.context.view.pos.z      = F(this.txtPosZ.value);
        this.context.view.rotation.x = CLAMP_DEGREES(F(this.txtRotX.value));
        this.context.view.rotation.y = CLAMP_DEGREES(F(this.txtRotY.value));
        this.context.view.rotation.z = CLAMP_DEGREES(F(this.txtRotZ.value));
        this.context.view.scale.x    = F(this.txtScaleX.value);
        this.context.view.scale.y    = F(this.txtScaleY.value);
        this.context.view.scale.z    = F(this.txtScaleZ.value);
        this.context.zNear           = F(this.txtZNear.value);
        this.context.zFar            = F(this.txtZFar.value);
        this.context.fov             = F(this.txtFov.value);
        this.context.enableTextures  = this.chkEnableTex.checked;
        this.context.useWireframe    = this.chkWireframe.checked;
        this.context.enableBackfaceCulling = this.chkEnableBackface.checked;
        this.context.showPickBuffer = this.chkShowPickBuffer.checked;
        this.context.useOrtho = this.chkOrtho.checked;
        this.context.frontFaceCW = this.btnFrontFaceCW.checked;
        this.context.useSRT = this.btnRotateCam.checked;
        this.context.moveSpeed = F(this.txtMoveSpeed.value);
        this.context.redraw();
    }

    /** Create elements for manual view parameter entry. */
    _createElements() {
        this._createInputFields();
        this._createMainElement();
    }

    _createNumericEntry(cls, step, val, min=null, max=null) {
        const elem = E.input(cls, {type:'number',step:step,value:val});
        if(min != null) elem.setAttribute('min', min);
        if(max != null) elem.setAttribute('max', max);
        //input event fires for *every* change.
        //change event only fires when committing, eg pressing Enter.
        elem.addEventListener('input', e => this._onChange(e));
        return elem;
    }

    _createInputFields() {
        //numeric entry fields for camera position, scale, angle, FOV, planes
        const F = (c,s,v) => this._createNumericEntry(c,s,v);
        const C = this.context;
        this.txtPosX  =F('x coord float',    1,    C.view.pos.x);
        this.txtPosY  =F('y coord float',    1,    C.view.pos.y);
        this.txtPosZ  =F('z coord float',    1,    C.view.pos.z);
        this.txtScaleX=F('x scale float',    0.01, C.view.scale.x);
        this.txtScaleY=F('y scale float',    0.01, C.view.scale.y);
        this.txtScaleZ=F('z scale float',    0.01, C.view.scale.z);
        this.txtRotX  =F('x angle float',   15,    C.view.rotation.x);
        this.txtRotY  =F('y angle float',   15,    C.view.rotation.y);
        this.txtRotZ  =F('z angle float',   15,    C.view.rotation.z);
        this.txtFov   =F('fov angle float',  5,    C.fov, 1, 360);
        this.txtZNear =F('znear coord float',0.01, C.zNear);
        this.txtZFar  =F('zfar coord float', 5,    C.zFar);
        this.txtMoveSpeed=F('speed float', 0.25,   C.moveSpeed, 0.25, 5);

        //checkbox to enable textures
        this.chkEnableTex = E.input(null, {type:'checkbox',
            id:`chkEnableTex${_nextId}`});
        this.lblEnableTex = E.label(null, {
            'for':`chkEnableTex${_nextId}`}, "Textures");
        this.chkEnableTex.checked = C.enableTextures;
        this.chkEnableTex.addEventListener('change', e => this._onChange(e));

        //checkbox to enable wireframe
        this.chkWireframe = E.input(null, {type:'checkbox',
            id:`chkWireframe${_nextId}`});
        this.lblWireframe = E.label(null, {
            'for':`chkWireframe${_nextId}`}, "Wireframe");
        this.chkWireframe.checked = C.useWireframe;
        this.chkWireframe.addEventListener('change', e => this._onChange(e));

        //checkbox to enable backface culling
        this.chkEnableBackface = E.input(null,
            {type:'checkbox', id:`chkEnableBcakface${_nextId}`});
        this.lblEnableBackface = E.label(null,
            {'for':`chkEnableBackface${_nextId}`}, "Cull Backfaces");
        this.chkEnableBackface.checked = C.enableBackfaceCulling;
        this.chkEnableBackface.addEventListener('change', e => this._onChange(e));

        //checkbox to display pick buffer
        this.chkShowPickBuffer = E.input(null, {type:'checkbox',
            id:`chkShowPickBuffer${_nextId}`});
        this.lblShowPickBuffer = E.label(null, {
            'for':`chkShowPickBuffer${_nextId}`}, "Show Pick Buffer");
        this.chkShowPickBuffer.checked = C.showPickBuffer;
        this.chkShowPickBuffer.addEventListener('change', e => this._onChange(e));

        //checkbox to use orthographic projection
        this.chkOrtho = E.input(null, {type:'checkbox',
            id:`chkOrtho${_nextId}`});
        this.lblOrtho = E.label(null,
            {'for':`chkOrtho${_nextId}`,
            title:"Use orthographic projection"}, "Ortho");
        this.chkOrtho.checked = C.useOrtho;
        this.chkOrtho.addEventListener('change', e => this._onChange(e));

        //button to reset to default params
        this.btnReset = E.button('reset', "Reset");
        this.btnReset.addEventListener('click', e => this.reset());

        //radio buttons to select front face order
        this.btnFrontFaceCW = E.input({type:'radio',
            name:`frontFace${_nextId}`,
            id:`frontFaceCW${_nextId}`});
        this.lblFrontFaceCW = E.label(null, {
            'for':`frontFaceCW${_nextId}`}, "CW");
        this.btnFrontFaceCW.checked = C.frontFaceCW;
        this.btnFrontFaceCW.addEventListener('change', e => this._onChange(e));

        this.btnFrontFaceCCW = E.input({type:'radio',
            name:`frontFace${_nextId}`,
            id:`frontFaceCCW${_nextId}`});
        this.lblFrontFaceCCW = E.label(null, {
            'for':`frontFaceCCW${_nextId}`}, "CCW");
        this.btnFrontFaceCCW.checked = !C.frontFaceCW;
        this.btnFrontFaceCCW.addEventListener('change', e => this._onChange(e));

        //radio buttons to select rotation point
        this.btnRotateCam = E.input({type:'radio',
            name:`rotPoint${_nextId}`,
            id:`rotPointCam${_nextId}`});
        this.lblRotateCam = E.label(null, {
            'for':`rotPointCam${_nextId}`}, "Camera");
        this.btnRotateCam.checked = C.useSRT;
        this.btnRotateCam.addEventListener('change', e => this._onChange(e));

        this.btnRotateOrg = E.input({type:'radio',
            name:`rotPoint${_nextId}`,
            id:`rotPointOrg${_nextId}`});
        this.lblRotateOrg = E.label(null, {
            'for':`rotPointOrg${_nextId}`}, "Origin");
        this.btnRotateOrg.checked = !C.useSRT;
        this.btnRotateOrg.addEventListener('change', e => this._onChange(e));

        _nextId++;
    }

    _createMainElement() {
        this.element = E.details('gl-view-control', {open:'open'},
            E.summary(null, "View"),
            E.table(
                E.tr(E.th(this.btnReset),
                    E.th(null,'X'), E.th(null,'Y'), E.th(null,'Z'),
                ),
                E.tr(
                    E.th(null,'Pos'),
                    E.td(this.txtPosX), E.td(this.txtPosY), E.td(this.txtPosZ),
                ),
                E.tr(
                    E.th(null,'Rot°'),
                    E.td(this.txtRotX), E.td(this.txtRotY), E.td(this.txtRotZ),
                ),

                E.tr(
                    E.th(null, "Speed"),
                    E.td({colspan:3}, this.txtMoveSpeed),
                ),

                E.tr(E.td(
                    this.chkEnableTex, this.lblEnableTex,
                    this.chkWireframe, this.lblWireframe,
                    this.chkOrtho,     this.lblOrtho,
                    {colspan:4}),
                ),
            ),

            E.details(null, E.summary(null, "Advanced"),
                E.table(
                    E.tr(
                        E.th(null,'Scale'),
                        E.td(this.txtScaleX), E.td(this.txtScaleY), E.td(this.txtScaleZ),
                    ),
                    E.tr(
                        E.th(null, "FOV°"),
                        E.td(this.txtFov),
                        E.td(null, " ", {colspan:2}),
                    ),
                    E.tr(
                        E.th(null, "Near"), E.td(null, this.txtZNear),
                        E.th(null, "Far"),  E.td(null, this.txtZFar),
                    ),
                    E.tr(
                        E.th(null, "Front Faces", {colspan:2}),
                        E.td({colspan:2},
                            this.btnFrontFaceCW, this.lblFrontFaceCW,
                            this.btnFrontFaceCCW, this.lblFrontFaceCCW,
                        ),
                    ),
                    E.tr(
                        E.th(null, "Rotation Axis", {colspan:2}),
                        E.td({colspan:2},
                            this.btnRotateCam, this.lblRotateCam,
                            this.btnRotateOrg, this.lblRotateOrg,
                        ),
                    ),
                    //we override this with shaders anyway
                    /* E.tr(
                        E.td({colspan:2},
                            this.chkEnableBackface, this.lblEnableBackface, {
                            title:"Enable backface culling",
                        }),
                    ), */
                    //currently doesn't work (but did just one time?)
                    E.tr(
                        E.td({colspan:2},
                            this.chkShowPickBuffer, this.lblShowPickBuffer, {
                            title:"Render the pick buffer for debug",
                        }),
                    ),
                ),
            ),
        );
    }
}
