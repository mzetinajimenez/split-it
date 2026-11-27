// Framework-free route predicates for the app shell.

const under = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

/** Routes that render their own fixed-bottom bar (StepNav, shared-view bar) in BottomNav's slot. */
export function ownsBottomBar(pathname: string) {
  return under(pathname, "/bills") || under(pathname, "/s");
}
