type Props = {
  subtitle: string
}

export function AppRailBrand({ subtitle }: Props) {
  return (
    <div className="admin-brand">
      <div className="admin-logo">A</div>
      <div>
        <div className="admin-brand-title">Agent Gateway</div>
        <div className="admin-brand-sub">{subtitle}</div>
      </div>
    </div>
  )
}
