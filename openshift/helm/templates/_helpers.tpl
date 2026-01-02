{{/*
Expand the name of the chart.
*/}}
{{- define "openshift-dashboard.name" -}}
{{- default .Chart.Name .Values.global.appName | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "openshift-dashboard.fullname" -}}
{{- if .Values.global.appName }}
{{- .Values.global.appName | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "openshift-dashboard.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "openshift-dashboard.labels" -}}
helm.sh/chart: {{ include "openshift-dashboard.chart" . }}
{{ include "openshift-dashboard.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "openshift-dashboard.selectorLabels" -}}
app: {{ include "openshift-dashboard.name" . }}
{{- end }}

{{/*
Service Account Name
*/}}
{{- define "openshift-dashboard.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- .Values.serviceAccount.name }}
{{- else }}
{{- .Values.serviceAccount.name }}
{{- end }}
{{- end }}

