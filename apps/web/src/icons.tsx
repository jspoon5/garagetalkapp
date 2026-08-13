import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M7.5 1.1 1.8 5.6v7.3h3.7V8.6h4v4.3h3.7V5.6L7.5 1.1Z"
        fill="currentColor"
      />
    </Icon>
  );
}

export function ChatBubbleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M1.5 2.5h12v8.2H8.1L4.2 13.4V10.7H1.5V2.5Z"
        fill="currentColor"
      />
    </Icon>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M6.1 1.2h2.8l.4 1.6 1.5.6 1.4-1 2 2-1 1.4.6 1.5 1.6.4v2.8l-1.6.4-.6 1.5 1 1.4-2 2-1.4-1-1.5.6-.4 1.6H6.1l-.4-1.6-1.5-.6-1.4 1-2-2 1-1.4-.6-1.5L.6 8.9V6.1l1.6-.4.6-1.5-1-1.4 2-2 1.4 1 1.5-.6.4-1.6ZM7.5 9.6a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2Z"
        fill="currentColor"
      />
    </Icon>
  );
}

export function MagnifyingGlassIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M6.5 2.2a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6Zm4.7 7.6 2.8 2.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Icon>
  );
}

export function PersonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M7.5 1.8a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4ZM2.4 13.2c.4-2.6 2.4-4 5.1-4s4.7 1.4 5.1 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Icon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M7.5 1.6A3.4 3.4 0 0 0 4.1 5v2.2L2.8 9.6h9.4L11 7.2V5A3.4 3.4 0 0 0 7.5 1.6ZM5.8 11.4a1.7 1.7 0 0 0 3.4 0"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.8 2.4 4.7 7.5 9.8 12.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.2 2.4 10.3 7.5 5.2 12.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Icon>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M7.5 12.6 3.2 8.4A2.8 2.8 0 1 1 7.5 4.6a2.8 2.8 0 1 1 4.3 3.8L7.5 12.6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function HeartFilledIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M7.5 12.6 3.2 8.4A2.8 2.8 0 1 1 7.5 4.6a2.8 2.8 0 1 1 4.3 3.8L7.5 12.6Z"
        fill="currentColor"
      />
    </Icon>
  );
}

export function VideoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M1.6 3.6h8.2v7.8H1.6V3.6Zm8.2 2.2 3.6-1.6v6.6l-3.6-1.6V5.8Z" fill="currentColor" />
    </Icon>
  );
}

export function RocketIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M7.5 1.4c2.4 1.4 4.2 4 4.2 6.6 0 1.4-.6 2.4-1.4 3.2l1.3 2.4-2.2-.4-.8.8-.4-2.2C7.4 12 6.4 12.4 5 12.4c-2.6 0-5.2-1.8-6.6-4.2C1.4 6.8 4.6 4.2 7.5 1.4Z"
        fill="currentColor"
      />
    </Icon>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M5.2 2.6h4.6l.8 1.4h2.2v8.4H2.2V4h2.2l.8-1.4ZM7.5 10.4A2.4 2.4 0 1 0 7.5 5.6a2.4 2.4 0 0 0 0 4.8Z"
        fill="currentColor"
      />
    </Icon>
  );
}

export function PaperPlaneIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M1.4 7.1 13.4 1.6 8.2 13.4 6.7 8.6 1.4 7.1Z" fill="currentColor" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.5 2.2v10.6M2.2 7.5h10.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </Icon>
  );
}

export function DotsHorizontalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="3" cy="7.5" r="1.3" fill="currentColor" />
      <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" />
      <circle cx="12" cy="7.5" r="1.3" fill="currentColor" />
    </Icon>
  );
}
