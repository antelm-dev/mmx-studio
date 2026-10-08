import { Menu, Portal } from "@chakra-ui/react";
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
