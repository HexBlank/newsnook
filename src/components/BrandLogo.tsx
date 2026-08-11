import { brandLogoSrc, type ResolvedTheme } from '../lib/theme'

interface Props {
  resolvedTheme: ResolvedTheme
  size?: number
  className?: string
}

/** 按落地主题切换 brand mark（dark→logo-light，light→logo-dark） */
export function BrandLogo({ resolvedTheme, size = 36, className }: Props) {
  return (
    <img
      src={brandLogoSrc(resolvedTheme)}
      alt=""
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  )
}
