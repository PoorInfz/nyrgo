import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type Api, type Profile } from '../api';

export function Verify({
  api,
  token,
  onDone,
}: {
  api: Api;
  token: string;
  onDone: (p: Profile | null) => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Links are single use: guard against React StrictMode running the effect twice.
    if (started.current) return;
    started.current = true;
    api
      .verify(token)
      .then((p) => onDone(p))
      .catch((err) =>
        setError(
          err instanceof ApiError && err.code === 'email_taken'
            ? t('emailTaken')
            : t('verifyFailed'),
        ),
      );
  }, [api, token, onDone, t]);

  if (!error) return <p role="status">{t('verifying')}</p>;
  return (
    <div className="stack">
      <p role="alert">{error}</p>
      <button type="button" onClick={() => onDone(null)}>
        {t('continue')}
      </button>
    </div>
  );
}
