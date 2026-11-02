import * as T from 'three';
const points={value:[]},directions={value:[]};
// D3D fixed-function colours are saturated BEFORE texture modulation. Phong's
// physically-normalized Lambert/Fresnel terms do not describe that pipeline.
export function updateNativeLighting(scene){
 const p=[],d=[];
 scene.traverseVisible(n=>{
  if(!n.isPointLight&&!n.isDirectionalLight)return;
  const spec=n.userData.nativeSpecular??[0,0,0];
  (n.isPointLight?p:d).push(new T.Vector3(...spec).multiplyScalar(n.intensity));
 });points.value=p;directions.value=d;
}
export function nativePhongShader(shader){
 shader.uniforms.nativePointSpecular=points;shader.uniforms.nativeDirectionalSpecular=directions;
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>',T.ShaderChunk.common.replace('struct IncidentLight {','struct IncidentLight {\n vec3 nativeSpecular;'));
 shader.fragmentShader=shader.fragmentShader.replace('#include <lights_pars_begin>',`
 #if NUM_POINT_LIGHTS > 0
 uniform vec3 nativePointSpecular[NUM_POINT_LIGHTS];
 #endif
 #if NUM_DIR_LIGHTS > 0
 uniform vec3 nativeDirectionalSpecular[NUM_DIR_LIGHTS];
 #endif
 `+T.ShaderChunk.lights_pars_begin);
 shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',T.ShaderChunk.lights_fragment_begin
  .replace('getPointLightInfo( pointLight, geometryPosition, directLight );','getPointLightInfo( pointLight, geometryPosition, directLight ); directLight.nativeSpecular = nativePointSpecular[i] * getDistanceAttenuation(length(pointLight.position - geometryPosition), pointLight.distance, pointLight.decay);')
  .replace('getDirectionalLightInfo( directionalLight, directLight );','getDirectionalLightInfo( directionalLight, directLight ); directLight.nativeSpecular = nativeDirectionalSpecular[i];'));
 shader.fragmentShader=shader.fragmentShader.replace('#include <lights_phong_pars_fragment>',T.ShaderChunk.lights_phong_pars_fragment
  .replace('irradiance * BRDF_Lambert( material.diffuseColor )','irradiance')
  .replace('irradiance * BRDF_Lambert( material.diffuseColor )','irradiance')
  .replace('irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength',
   'directLight.nativeSpecular * material.specularColor * pow(saturate(dot(geometryNormal, normalize(directLight.direction + geometryViewDir))), material.specularShininess) * step(0.00001, dotNL) * material.specularStrength'));
 shader.fragmentShader=shader.fragmentShader.replace('reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular',
  'clamp(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, 0.0, 1.0) * diffuseColor.rgb + reflectedLight.directSpecular');
}
export class NativePhongMaterial extends T.MeshPhongMaterial {
 constructor(options){super(options);this.onBeforeCompile=nativePhongShader;}
 customProgramCacheKey(){return 'tank-o-box-fixed-lighting-v1';}
}
