import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Shared CRM-themed tab styling so admin project views and the client portal
 * share the same horizontal underline tab look.
 *
 * Usage:
 *   <ProjectTabs value={tab} onValueChange={setTab}>
 *     <ProjectTabsList>
 *       <ProjectTabsTrigger value="a">Proposals</ProjectTabsTrigger>
 *     </ProjectTabsList>
 *     <ProjectTabsContent value="a">…</ProjectTabsContent>
 *   </ProjectTabs>
 */

export function ProjectTabs(
  props: React.ComponentProps<typeof Tabs> & { variant?: "dark" | "portal" },
) {
  const { variant: _variant, ...rest } = props;
  return <Tabs {...rest} />;
}

export const ProjectTabsList = React.forwardRef<
  React.ElementRef<typeof TabsList>,
  React.ComponentPropsWithoutRef<typeof TabsList>
>(({ className, style, ...props }, ref) => (
  <TabsList
    ref={ref}
    className={cn(
      "h-auto justify-start gap-1 rounded-none border-b border-[var(--crm-border-dark)] bg-transparent p-0",
      className,
    )}
    style={style}
    {...props}
  />
));
ProjectTabsList.displayName = "ProjectTabsList";

export const ProjectTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsTrigger>,
  React.ComponentPropsWithoutRef<typeof TabsTrigger>
>(({ className, ...props }, ref) => (
  <TabsTrigger
    ref={ref}
    className={cn(
      "relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-3 text-[12px] uppercase tracking-[0.3em]",
      "text-[var(--crm-taupe)] hover:text-[var(--crm-warm-white)] transition-colors",
      "data-[state=active]:border-[var(--crm-accent)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--crm-warm-white)] data-[state=active]:shadow-none",
      "data-[state=active]:font-normal",
      "focus-visible:ring-0 focus-visible:ring-offset-0",
      className,
    )}
    {...props}
  />
));
ProjectTabsTrigger.displayName = "ProjectTabsTrigger";

export const ProjectTabsContent = React.forwardRef<
  React.ElementRef<typeof TabsContent>,
  React.ComponentPropsWithoutRef<typeof TabsContent>
>(({ className, ...props }, ref) => (
  <TabsContent
    ref={ref}
    className={cn("mt-6 focus-visible:ring-0 focus-visible:ring-offset-0", className)}
    {...props}
  />
));
ProjectTabsContent.displayName = "ProjectTabsContent";
