{{- define "inspectflow-cloud.name" -}}
inspectflow-cloud
{{- end -}}

{{- define "inspectflow-cloud.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "inspectflow-cloud.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "inspectflow-cloud.labels" -}}
app.kubernetes.io/name: {{ include "inspectflow-cloud.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: Helm
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
{{- end -}}

{{- define "inspectflow-cloud.selectorLabels" -}}
app.kubernetes.io/name: {{ include "inspectflow-cloud.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
