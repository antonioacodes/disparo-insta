'use client';

import { FolderPen, Upload, FileCheck2 } from 'lucide-react';

export function ProjectName({value, onChange, required = false}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return <label className="studioField">
    <span>Nome do projeto</span>
    <span className="studioTextInput">
      <FolderPen size={19} aria-hidden="true"/>
      <input value={value} required={required} maxLength={200}
        placeholder="Ex.: Melhores momentos da semana"
        onChange={event => onChange(event.currentTarget.value)}/>
    </span>
  </label>;
}

export function SourcePicker({file, onChange, disabled}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled: boolean;
}) {
  const Icon = file ? FileCheck2 : Upload;
  return <label className="sourcePicker" data-disabled={disabled}>
    <input type="file" disabled={disabled} aria-label="Selecionar arquivo de origem"
      accept="video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav"
      onChange={event => onChange(event.currentTarget.files?.[0] || null)}/>
    <Icon size={22} aria-hidden="true"/>
    <span><strong>{file?.name || 'Selecionar arquivo'}</strong>
      <small>{file ? (file.size / 1048576).toLocaleString('pt-BR', {maximumFractionDigits:1}) + ' MB · Clique para trocar' : 'MP4, MOV, WebM, MP3 ou WAV'}</small>
    </span>
  </label>;
}
