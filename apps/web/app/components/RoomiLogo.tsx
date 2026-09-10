type RoomiLogoProps = {
  className?: string;
  size?: number;
};

export default function RoomiLogo({ className, size = 28 }: RoomiLogoProps) {
  return (
    <img
      src="/roomi-logo.svg"
      alt=""
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  );
}
