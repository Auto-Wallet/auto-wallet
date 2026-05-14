import React, { useEffect, useRef, useState } from 'react';
import { CloseIcon } from './icons';

interface Props {
  open: boolean;
  /** Heading shown at the top of each step. */
  title: string;
  /** Short noun phrase used in copy, e.g. "this account" or "all accounts". */
  subject: string;
  /** Label of the final destructive button on step 3. */
  destructiveLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Three-step confirmation modal for irreversible account deletion.
 *
 * Used only when the deletion can destroy a private key that is not recoverable
 * elsewhere (privateKey + mnemonic accounts). Ledger / watch-only deletions
 * skip this flow.
 *
 * Steps:
 *   1. Plain warning — explain that each account is its own private key.
 *   2. Acknowledge the user has backed up the private key.
 *   3. Acknowledge that a mnemonic in this wallet only maps to one address.
 */
export function DeleteDangerModal({ open, title, subject, destructiveLabel, onCancel, onConfirm }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [ackBackup, setAckBackup] = useState(false);
  const [ackMnemonic, setAckMnemonic] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset state every time the modal opens.
  useEffect(() => {
    if (open) {
      setStep(1);
      setAckBackup(false);
      setAckMnemonic(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div ref={overlayRef} className="receive-modal-overlay">
      <div className="receive-modal-panel danger-modal-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="receive-modal-header">
          <span className="receive-modal-title">
            {title} <span className="danger-modal-step">({step} / 3)</span>
          </span>
          <button onClick={onCancel} className="receive-modal-close" aria-label="Cancel">
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="danger-modal-body">
          {step === 1 && (
            <>
              <p className="danger-modal-headline">
                You are about to permanently delete {subject}.
              </p>
              <p className="danger-modal-text">
                Every account in Auto Wallet is its own independent private key. There is no master seed
                that can restore it — once the key is removed from this device, it is gone forever.
              </p>
              <p className="danger-modal-text">
                If you have not backed up the private key, do not continue.
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <p className="danger-modal-headline">Did you back up the private key?</p>
              <p className="danger-modal-text">
                You can export the raw private key from Settings → Export Private Key before deleting.
                Without that backup, the funds on this address become unrecoverable.
              </p>
              <label className="danger-modal-check">
                <input
                  type="checkbox"
                  checked={ackBackup}
                  onChange={(e) => setAckBackup(e.target.checked)}
                />
                <span>I have backed up the private key.</span>
              </label>
            </>
          )}

          {step === 3 && (
            <>
              <p className="danger-modal-headline">One more thing about mnemonics.</p>
              <p className="danger-modal-text">
                In Auto Wallet, a mnemonic is treated as a single secret — it only restores
                <strong> one address</strong> (derivation index 0). The wallet does not derive other
                addresses from the same mnemonic, so saving the seed phrase is <em>not</em> a substitute
                for backing up each account's private key.
              </p>
              <label className="danger-modal-check">
                <input
                  type="checkbox"
                  checked={ackMnemonic}
                  onChange={(e) => setAckMnemonic(e.target.checked)}
                />
                <span>I understand a mnemonic in Auto Wallet maps to a single address only.</span>
              </label>
            </>
          )}
        </div>

        <div className="danger-modal-footer">
          {step === 1 && (
            <>
              <button onClick={onCancel} className="btn-ghost danger-modal-secondary">Cancel</button>
              <button onClick={() => setStep(2)} className="btn-danger danger-modal-primary">Continue</button>
            </>
          )}
          {step === 2 && (
            <>
              <button onClick={() => setStep(1)} className="btn-ghost danger-modal-secondary">Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={!ackBackup}
                className="btn-danger danger-modal-primary"
              >
                Continue
              </button>
            </>
          )}
          {step === 3 && (
            <>
              <button onClick={() => setStep(2)} className="btn-ghost danger-modal-secondary">Back</button>
              <button
                onClick={onConfirm}
                disabled={!ackMnemonic}
                className="btn-danger danger-modal-primary"
              >
                {destructiveLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
