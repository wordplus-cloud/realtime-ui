// The camera's passes on the GPU, in the canvas's own WebGL2 context, which MediaPipe shares (segmenter.ts), so the
// mask never leaves the GPU. From the effects lab (effects-lab/lab.js): the newest mask kept with the one before where
// the model hesitates, the edge refined against the camera's own frame (joint bilateral upsampling), then the room
// blurred or replaced behind the person.

const VS = `#version 300 es
in vec2 p;out vec2 uv;uniform float flip;
void main(){uv=p*.5+.5;if(flip>.5)uv.y=1.-uv.y;gl_Position=vec4(p,0.,1.);}`;

const HEAD = `#version 300 es
precision highp float;precision highp int;in vec2 uv;out vec4 o;
`;

const FS = {
    // The newest mask into the processor's own texture, mixed with the one before where the model hesitates, the most
    // `keep` of it where the person is as likely as not.
    mask: HEAD + `uniform sampler2D src,prev;uniform float keep,invert,first;
void main(){ivec2 c=ivec2(gl_FragCoord.xy);float now=clamp(texelFetch(src,c,0).r,0.,1.);if(invert>.5)now=1.-now;
float old=texelFetch(prev,c,0).r;float k=first>.5?0.:keep*(1.-abs(now-.5)*2.);o=vec4(now+(old-now)*k,0.,0.,1.);}`,

    // Joint bilateral upsampling: each point takes the mask around it, weighed by how near it is (in the model's own
    // texels) and how alike in colour, so the edge follows the person's outline in the frame, then sharpened. The mask
    // is read where the frame lies in it (maskFit: scale, then offset), never past the frame's edge into a letterbox.
    jbu: HEAD + `uniform sampler2D frame,mask;uniform vec2 edge,texel;uniform vec4 maskFit;uniform float sigmaC;
void main(){vec3 c0=texture(frame,uv).rgb;float s=0.,ws=0.;vec2 mh=.5/vec2(textureSize(mask,0));
vec2 lo=maskFit.zw+mh,hi=maskFit.zw+maskFit.xy-mh;
for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){vec2 d=vec2(x,y);vec2 q=uv+d*texel;vec3 c=texture(frame,q).rgb-c0;
float w=exp(-dot(d,d)*.2222-dot(c,c)/(2.*sigmaC*sigmaC));s+=texture(mask,clamp(q*maskFit.xy+maskFit.zw,lo,hi)).r*w;ws+=w;}
o=vec4(smoothstep(edge.x,edge.y,s/max(ws,1e-5)),0.,0.,1.);}`,

    // The room alone, premultiplied by how much of each point is the room, from four taps, at a quarter of the frame.
    away: HEAD + `uniform sampler2D frame,alpha;uniform vec2 h;
vec4 tap(vec2 q){float w=1.-texture(alpha,q).r;return vec4(texture(frame,q).rgb*w,w);}
void main(){o=.25*(tap(uv+vec2(-h.x,-h.y))+tap(uv+vec2(h.x,-h.y))+tap(uv+vec2(-h.x,h.y))+tap(uv+vec2(h.x,h.y)));}`,

    blur: HEAD + `uniform sampler2D src;uniform vec2 dir;
void main(){vec4 s=texture(src,uv)*.2270270270;
s+=(texture(src,uv+dir*1.3846153846)+texture(src,uv-dir*1.3846153846))*.3162162162;
s+=(texture(src,uv+dir*3.2307692308)+texture(src,uv-dir*3.2307692308))*.0702702703;o=s;}`,

    // The person over the room: the blurred room (look 0, premultiplied, the frame itself where nothing of the room is
    // near), or a picture fitted to cover the frame (look 1).
    final: HEAD + `uniform sampler2D frame,alpha,back;uniform int look;uniform vec4 fit;
void main(){vec3 own=texture(frame,uv).rgb;float a=texture(alpha,uv).r;vec3 bg;
if(look==1){bg=texture(back,uv*fit.xy+fit.zw).rgb;}else{vec4 b=texture(back,uv);bg=b.a>.004?b.rgb/b.a:own;}
o=vec4(mix(bg,own,a),1.);}`,
};

type Pass = keyof typeof FS;

export interface Target {
    texture: WebGLTexture,
    buffer: WebGLFramebuffer,
    width: number,
    height: number,
}

type Value = WebGLTexture | number | number[];

interface Program {
    program: WebGLProgram,
    uniforms: Record<string, { location: WebGLUniformLocation | null, type: number }>,
}

export class Gpu {
    /** Whether half floats can be drawn into: the mask keeps its fine steps then, bytes otherwise. */
    private readonly float: boolean;
    private readonly vao: WebGLVertexArrayObject | null;
    private readonly programs = {} as Record<Pass, Program>;
    private readonly pixel = new Uint8Array( 4 );

    constructor( readonly gl: WebGL2RenderingContext ) {
        this.float = !! gl.getExtension( "EXT_color_buffer_float" );
        gl.getExtension( "OES_texture_float_linear" );
        this.vao = gl.createVertexArray();
        gl.bindVertexArray( this.vao );
        const quad = gl.createBuffer();
        gl.bindBuffer( gl.ARRAY_BUFFER, quad );
        gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( [ -1, -1, 1, -1, -1, 1, 1, 1 ] ), gl.STATIC_DRAW );
        gl.enableVertexAttribArray( 0 );
        gl.vertexAttribPointer( 0, 2, gl.FLOAT, false, 0, 0 );
        gl.bindVertexArray( null );
        for ( const [ name, source ] of Object.entries( FS ) ) this.programs[ name as Pass ] = this.program( source );
    }

    private program( fragment: string ): Program {
        const gl = this.gl;
        const compile = ( type: number, text: string ) => {
            const shader = gl.createShader( type )!;
            gl.shaderSource( shader, text );
            gl.compileShader( shader );
            if ( ! gl.getShaderParameter( shader, gl.COMPILE_STATUS ) ) throw new Error( gl.getShaderInfoLog( shader ) || "A shader did not compile" );
            return shader;
        };
        const program = gl.createProgram()!;
        gl.attachShader( program, compile( gl.VERTEX_SHADER, VS ) );
        gl.attachShader( program, compile( gl.FRAGMENT_SHADER, fragment ) );
        gl.bindAttribLocation( program, 0, "p" );
        gl.linkProgram( program );
        if ( ! gl.getProgramParameter( program, gl.LINK_STATUS ) ) throw new Error( gl.getProgramInfoLog( program ) || "A program did not link" );
        const uniforms: Program[ "uniforms" ] = {};
        const count = gl.getProgramParameter( program, gl.ACTIVE_UNIFORMS );
        for ( let i = 0; i < count; i++ ) {
            const info = gl.getActiveUniform( program, i )!;
            uniforms[ info.name ] = { location: gl.getUniformLocation( program, info.name ), type: info.type };
        }
        return { program, uniforms };
    }

    texture(): WebGLTexture {
        const gl = this.gl;
        const texture = gl.createTexture()!;
        gl.bindTexture( gl.TEXTURE_2D, texture );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
        return texture;
    }

    target( width: number, height: number, format: "r8" | "r16f" | "rgba16f" ): Target {
        const gl = this.gl;
        const texture = this.texture();
        const [ inner, outer, type ] = {
            r8: [ gl.R8, gl.RED, gl.UNSIGNED_BYTE ],
            r16f: this.float ? [ gl.R16F, gl.RED, gl.HALF_FLOAT ] : [ gl.R8, gl.RED, gl.UNSIGNED_BYTE ],
            rgba16f: this.float ? [ gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT ] : [ gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE ],
        }[ format ];
        gl.texImage2D( gl.TEXTURE_2D, 0, inner, width, height, 0, outer, type, null );
        const buffer = gl.createFramebuffer()!;
        gl.bindFramebuffer( gl.FRAMEBUFFER, buffer );
        gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0 );
        gl.clearColor( 0, 0, 0, 0 );
        gl.clear( gl.COLOR_BUFFER_BIT );
        return { texture, buffer, width, height };
    }

    free( target: Target | null | undefined ): void {
        if ( ! target ) return;
        this.gl.deleteTexture( target.texture );
        this.gl.deleteFramebuffer( target.buffer );
    }

    /** One full-frame pass of `name` into `target` (null: the canvas), with these textures and uniforms. */
    pass( name: Pass, target: Target | null, values: Record<string, Value> ): void {
        const gl = this.gl;
        const { program, uniforms } = this.programs[ name ];
        gl.bindFramebuffer( gl.FRAMEBUFFER, target ? target.buffer : null );
        gl.viewport( 0, 0, target ? target.width : gl.drawingBufferWidth, target ? target.height : gl.drawingBufferHeight );
        gl.useProgram( program );
        let unit = 0;
        const all: Record<string, Value> = { flip: target ? 0 : 1, ...values };
        for ( const [ key, value ] of Object.entries( all ) ) {
            const uniform = uniforms[ key ];
            if ( ! uniform ) continue;
            switch ( uniform.type ) {
                case gl.SAMPLER_2D:
                    gl.activeTexture( gl.TEXTURE0 + unit );
                    gl.bindTexture( gl.TEXTURE_2D, value as WebGLTexture );
                    gl.uniform1i( uniform.location, unit++ );
                    break;
                case gl.FLOAT: gl.uniform1f( uniform.location, value as number ); break;
                case gl.FLOAT_VEC2: gl.uniform2fv( uniform.location, value as number[] ); break;
                case gl.FLOAT_VEC4: gl.uniform4fv( uniform.location, value as number[] ); break;
                case gl.INT: gl.uniform1i( uniform.location, value as number ); break;
            }
        }
        gl.drawArrays( gl.TRIANGLE_STRIP, 0, 4 );
    }

    /** What the passes count on, set again each time: MediaPipe's work in the same context leaves its own. */
    begin(): void {
        const gl = this.gl;
        gl.bindVertexArray( this.vao );
        gl.disable( gl.BLEND );
        gl.disable( gl.DEPTH_TEST );
        gl.disable( gl.SCISSOR_TEST );
        gl.disable( gl.CULL_FACE );
        gl.colorMask( true, true, true, true );
        gl.pixelStorei( gl.UNPACK_FLIP_Y_WEBGL, false );
        gl.pixelStorei( gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false );
    }

    end(): void {
        const gl = this.gl;
        gl.bindVertexArray( null );
        gl.bindFramebuffer( gl.FRAMEBUFFER, null );
        gl.useProgram( null );
        gl.activeTexture( gl.TEXTURE0 );
    }

    /** Waits until the GPU has done everything asked of it so far: only to time the models (quality.ts). */
    sync(): void {
        this.gl.readPixels( 0, 0, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.pixel );
    }
}
