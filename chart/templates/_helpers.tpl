{{/*
Nom du chart, avec surcharge éventuelle
*/}}
{{- define "slots.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{/*
Nom complet des ressources
*/}}
{{- define "slots.fullname" -}}
{{- if .Values.fullnameOverride -}}
  {{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
  {{- $name := include "slots.name" . -}}
  {{- if contains $name .Release.Name -}}
    {{- .Release.Name | trunc 63 | trimSuffix "-" -}}
  {{- else -}}
    {{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
  {{- end -}}
{{- end -}}
{{- end }}

{{- define "slots.labels" -}}
app.kubernetes.io/name: {{ include "slots.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Nom du cluster PostgreSQL géré par CloudNativePG
*/}}
{{- define "slots.postgresql" -}}
{{- printf "%s-postgresql" (include "slots.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{/*
Secret et clé où lire l'URL de la base
*/}}
{{- define "slots.databaseSecret" -}}
{{- if .Values.database.cnpg.enabled -}}
{{- printf "%s-app" (include "slots.postgresql" .) -}}
{{- else -}}
{{- required "database.existingSecret.name est requis quand database.cnpg.enabled est false" .Values.database.existingSecret.name -}}
{{- end -}}
{{- end }}
