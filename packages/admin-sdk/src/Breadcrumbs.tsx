import React from "react"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@fabriq/ui"

export interface BreadcrumbsProps {
  sectionLabel: string
  sectionTo: string
  params?: Record<string, string>
  onNavigate?: (to: string) => void
}

export function Breadcrumbs({ sectionLabel, sectionTo, params, onNavigate }: BreadcrumbsProps) {
  // Param values in declared order (type before id, etc.).
  const crumbs = params
    ? Object.values(params).map((v) => decodeURIComponent(v))
    : []

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.length === 0 ? (
          <BreadcrumbItem>
            <BreadcrumbPage>{sectionLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        ) : (
          <>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  onNavigate?.(sectionTo)
                }}
              >
                {sectionLabel}
              </BreadcrumbLink>
            </BreadcrumbItem>
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1
              return (
                <React.Fragment key={`${c}-${i}`}>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    {last ? (
                      <BreadcrumbPage>{c}</BreadcrumbPage>
                    ) : (
                      <span className="text-muted-foreground">{c}</span>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              )
            })}
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
