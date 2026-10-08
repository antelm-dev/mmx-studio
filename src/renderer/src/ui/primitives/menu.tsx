import { Box, Menu, Portal } from "@chakra-ui/react";
import type { ComponentProps } from "react";

export const MenuRoot = Menu.Root;
export const MenuTrigger = Menu.Trigger;

/** Popover surface portalled to `body` so Dockview never clips it. */
export function MenuContent(props: ComponentProps<typeof Menu.Content>) {
  return (
    <Portal>
      <Menu.Positioner>
        <Menu.Content
          minW="220px"
          maxW="300px"
          py="1.5"
          px="0"
          bg="studio.popover"
          border="1px solid"
          borderColor="studio.popoverBorder"
          rounded="lg"
          boxShadow="0 12px 32px rgba(0,0,0,0.45)"
          overflow="hidden"
          {...props}
        />
      </Menu.Positioner>
    </Portal>
  );
}

export function MenuItem(props: ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      gap="9px"
      px="3"
      py="1.5"
      rounded="0"
      fontSize="12.5px"
      color="studio.menuFg"
      cursor="pointer"
      _highlighted={{ bg: "studio.popoverHover", color: "studio.menuFgHover" }}
      {...props}
    />
  );
}

/** Opens the enclosing `MenuRoot` at the pointer on DOM right-click (`asChild` on the row). */
export const MenuContextTrigger = Menu.ContextTrigger;

export function MenuSeparator(props: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator my="1" mx="0" borderColor="studio.popoverBorder" {...props} />;
}

/** Non-interactive caption row inside a menu (section heading, context info). */
export function MenuLabel(props: ComponentProps<typeof Box>) {
  return (
    <Box
      px="3"
      pt="1"
      pb="0.5"
      fontSize="10px"
      textTransform="uppercase"
      letterSpacing="0.5px"
      color="studio.muted"
      {...props}
    />
  );
}
