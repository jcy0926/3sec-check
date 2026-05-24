-- analysis_logs: 분석 통계용 컬럼 추가
ALTER TABLE public.analysis_logs
  ADD COLUMN IF NOT EXISTS image_count integer,
  ADD COLUMN IF NOT EXISTS risk_level text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.analysis_logs.image_count IS '업로드한 이미지 수';
COMMENT ON COLUMN public.analysis_logs.risk_level IS '위험도 결과 (위험, 주의, 안전)';
COMMENT ON COLUMN public.analysis_logs.created_at IS '분석 시각';

ALTER TABLE public.analysis_logs
  DROP CONSTRAINT IF EXISTS analysis_logs_risk_level_check;

ALTER TABLE public.analysis_logs
  ADD CONSTRAINT analysis_logs_risk_level_check
  CHECK (risk_level IS NULL OR risk_level IN ('위험', '주의', '안전'));
