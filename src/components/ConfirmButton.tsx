// 브라우저 확인 팝업(confirm) 대신 쓰는 두 단계 버튼.
// 팝업은 Claude in Chrome 같은 브라우저 자동화를 멈추게 해서, 확인도 페이지 안에서 받습니다.
// 첫 클릭 → '정말 ○○' + '취소'로 바뀌고, 6초 안에 다시 누르면 실행. 그냥 두면 원래대로.
import { useEffect, useState, type ReactNode } from 'react';

export default function ConfirmButton({
  children,
  confirmLabel,
  message,
  onConfirm,
  className = '',
  disabled,
  title,
}: {
  children: ReactNode;
  confirmLabel: string;
  message?: string; // 확인 단계에서 버튼 옆에 보일 짧은 설명
  onConfirm: () => void | Promise<void>;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);

  if (!armed)
    return (
      <button type="button" className={className} disabled={disabled} title={title} onClick={() => setArmed(true)}>
        {children}
      </button>
    );
  return (
    <span className="confirm-inline" role="group" aria-label="확인">
      {message && <span className="small confirm-msg">{message}</span>}
      <button
        type="button"
        className={`${className} confirm-yes`}
        onClick={async () => {
          setArmed(false);
          await onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="small" onClick={() => setArmed(false)}>
        취소
      </button>
    </span>
  );
}
