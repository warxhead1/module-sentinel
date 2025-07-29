/**
 * Math utilities for 3D transformations
 * Lightweight matrix and vector operations
 */

export const mat4 = {
  create(): Float32Array {
    const out = new Float32Array(16);
    out[0] = 1;
    out[5] = 1;
    out[10] = 1;
    out[15] = 1;
    return out;
  },

  perspective(out: Float32Array, fovy: number, aspect: number, near: number, far: number): Float32Array {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = 2 * far * near * nf;
    out[15] = 0;
    return out;
  },

  lookAt(out: Float32Array, eye: Float32Array, center: Float32Array, up: Float32Array): Float32Array {
    const x0 = eye[0] - center[0];
    const x1 = eye[1] - center[1];
    const x2 = eye[2] - center[2];
    let len = x0 * x0 + x1 * x1 + x2 * x2;
    
    if (len > 0) {
      len = 1 / Math.sqrt(len);
      const z0 = x0 * len;
      const z1 = x1 * len;
      const z2 = x2 * len;
      
      const x0_ = up[1] * z2 - up[2] * z1;
      const x1_ = up[2] * z0 - up[0] * z2;
      const x2_ = up[0] * z1 - up[1] * z0;
      
      len = x0_ * x0_ + x1_ * x1_ + x2_ * x2_;
      if (len > 0) {
        len = 1 / Math.sqrt(len);
        const x0__ = x0_ * len;
        const x1__ = x1_ * len;
        const x2__ = x2_ * len;
        
        const y0 = z1 * x2__ - z2 * x1__;
        const y1 = z2 * x0__ - z0 * x2__;
        const y2 = z0 * x1__ - z1 * x0__;
        
        out[0] = x0__;
        out[1] = y0;
        out[2] = z0;
        out[3] = 0;
        out[4] = x1__;
        out[5] = y1;
        out[6] = z1;
        out[7] = 0;
        out[8] = x2__;
        out[9] = y2;
        out[10] = z2;
        out[11] = 0;
        out[12] = -(x0__ * eye[0] + x1__ * eye[1] + x2__ * eye[2]);
        out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
        out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
        out[15] = 1;
      }
    }
    return out;
  },

  multiply(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    
    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    
    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    
    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    
    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    
    return out;
  }
};

export const vec3 = {
  create(): Float32Array {
    return new Float32Array(3);
  },

  subtract(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
    return out;
  },

  add(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    out[2] = a[2] + b[2];
    return out;
  },

  scale(out: Float32Array, a: Float32Array, scale: number): Float32Array {
    out[0] = a[0] * scale;
    out[1] = a[1] * scale;
    out[2] = a[2] * scale;
    return out;
  },

  length(a: Float32Array): number {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  },

  normalize(out: Float32Array, a: Float32Array): Float32Array {
    const len = vec3.length(a);
    if (len > 0) {
      const invLen = 1 / len;
      out[0] = a[0] * invLen;
      out[1] = a[1] * invLen;
      out[2] = a[2] * invLen;
    }
    return out;
  },

  distance(a: Float32Array, b: Float32Array): number {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
};

export const vec4 = {
  create(): Float32Array {
    return new Float32Array(4);
  },

  fromValues(x: number, y: number, z: number, w: number): Float32Array {
    const out = new Float32Array(4);
    out[0] = x;
    out[1] = y;
    out[2] = z;
    out[3] = w;
    return out;
  }
};