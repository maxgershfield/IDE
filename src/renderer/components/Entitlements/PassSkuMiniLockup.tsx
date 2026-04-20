import React from 'react';
import { getPassLockupVisual } from './passLockupVisuals';
import './PassSkuMiniLockup.css';

const BRANDFETCH_CLIENT = '1ida8ggQZDf64bgCqxt';

function brandfetchUrl(domain: string): string {
  return `https://cdn.brandfetch.io/domain/${encodeURIComponent(domain)}?c=${encodeURIComponent(BRANDFETCH_CLIENT)}`;
}

export interface PassSkuMiniLockupProps {
  skuId: string;
  /** When set (logged-in user), overrides placeholder identity on the artwork */
  displayName?: string | null;
  handle?: string | null;
}

/**
 * Small static NFT pass artwork for catalog cards. Full interactive preview remains in
 * `public/pass-lockup-editor.html` for design work; this is a read-only mini lockup.
 */
export const PassSkuMiniLockup: React.FC<PassSkuMiniLockupProps> = ({
  skuId,
  displayName: displayNameProp,
  handle: handleProp,
}) => {
  const v = getPassLockupVisual(skuId);
  if (!v) return null;

  const displayName = displayNameProp?.trim() || v.placeholderDisplayName;
  const handle = handleProp?.trim() || v.placeholderHandle;
  const a = v.accent;

  const style = {
    '--mini-glow': `rgba(${a.glow}, 0.38)`,
    '--mini-edge': `rgba(${a.edge}, 0.3)`,
    '--mini-inner': `rgba(${a.inner}, 0.09)`,
    '--mini-sheen': `rgba(${a.sheen}, 0.07)`,
  } as React.CSSProperties;

  const logoSrc = `${import.meta.env.BASE_URL}oasis-logo.png`;

  return (
    <div className="ent-mini-pass" style={style} aria-hidden>
      <div className="ent-mini-pass__shell">
        <div className="ent-mini-pass__hole" aria-hidden />
        <div className="ent-mini-pass__plate">
          <div className="ent-mini-pass__brand">
            <img className="ent-mini-pass__logo" src={logoSrc} alt="" width={120} height={26} decoding="async" />
            {v.brandDomain ? (
              <>
                <span className="ent-mini-pass__join">+</span>
                <img
                  className="ent-mini-pass__partner"
                  src={brandfetchUrl(v.brandDomain)}
                  alt=""
                  width={22}
                  height={22}
                  loading="lazy"
                />
              </>
            ) : null}
          </div>
          <div className="ent-mini-pass__tier">{v.tierLine}</div>
          <div className="ent-mini-pass__rule" aria-hidden />
          <div className="ent-mini-pass__id">
            <span className="ent-mini-pass__handle">{handle}</span>
            <span className="ent-mini-pass__name">{displayName}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
