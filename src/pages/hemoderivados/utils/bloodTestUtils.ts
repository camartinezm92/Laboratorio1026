import { BloodTestRecord } from '../types';

export const generateInterpretation = (record: Partial<BloodTestRecord>) => {
  const patientGroup = `${record.bloodGroup || ''} Rh${record.rh || ''}`;
  const unitGroup = `${record.unitGroup || ''} Rh${record.unitRh || ''}`;
  
  if (record.requestedHemoderivative && record.requestedHemoderivative !== 'Globulos Rojos') {
    return `Se realiza verificación de compatibilidad ABO/Rh para ${record.requestedHemoderivative}. Paciente: ${record.patientName || '[Nombre]'} (Grupo ${patientGroup}), Unidad: ${record.unitId || '[Número]'} (Grupo ${unitGroup}). Se confirma disponibilidad de la unidad para el paciente.`;
  }

  if (record.result === 'Compatible') {
    return `Se realizó prueba cruzada mayor manual entre el paciente ${record.patientName || '[Nombre]'} (Grupo ${patientGroup}) y la unidad ${record.unitId || '[Número]'} (Grupo ${unitGroup}). Tras las fases salina, albúmina y antiglobulina, no se observó aglutinación ni hemólisis. Resultado: Compatible para transfusión.`;
  } else if (record.result === 'Incompatible') {
    return `Se realizó prueba cruzada mayor manual entre el paciente ${record.patientName || '[Nombre]'} (Grupo ${patientGroup}) y la unidad ${record.unitId || '[Número]'} (Grupo ${unitGroup}). Tras las fases salina, albúmina y antiglobulina, se observó aglutinación y/o hemólisis. Resultado: Incompatible para transfusión.`;
  } else if (record.result === 'Unidad disponible') {
    return `Se realiza verificación de compatibilidad ABO/Rh para ${record.requestedHemoderivative || 'hemoderivado'}. Paciente: ${record.patientName || '[Nombre]'} (Grupo ${patientGroup}), Unidad: ${record.unitId || '[Número]'} (Grupo ${unitGroup}). Se confirma disponibilidad de la unidad para el paciente.`;
  }
  
  return '';
};
