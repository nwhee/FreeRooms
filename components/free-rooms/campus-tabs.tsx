"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Campus } from "@/lib/data/schema";

type Props = {
  campuses: readonly Campus[];
  value: string;
  onValueChange: (code: string) => void;
  /** Rendered only inside the selected campus's panel. */
  children: (campus: Campus) => ReactNode;
};

/** One tab per campus in file order. The list scrolls sideways when it overflows. */
export function CampusTabs({ campuses, value, onValueChange, children }: Props) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className="gap-4">
      <TabsList
        aria-label="Campus"
        className="w-full max-w-full justify-start overflow-x-auto group-data-horizontal/tabs:h-auto"
      >
        {campuses.map((campus) => (
          <TabsTrigger key={campus.code} value={campus.code} className="h-11 flex-none px-3">
            {campus.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {campuses.map((campus) => (
        <TabsContent key={campus.code} value={campus.code} className="flex flex-col gap-6 focus-visible:ring-offset-4 focus-visible:ring-offset-background">
          {campus.code === value && children(campus)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
