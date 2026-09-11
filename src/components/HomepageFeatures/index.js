import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Sense',
    subtitle: 'FT300-S · TFS85',
    description:
      'Detect contact forces, torques, and tactile feedback to give your robot a precise sense of touch.',
    images: [
      { src: '/img/FT-300-S_3Drender_white-background.png', alt: 'FT300-S Force Torque Sensor' },
      { src: '/img/TSF85 tactile finger 2.png', alt: 'TFS85 Tactile Sensor' },
    ],
    variant: 'product',
  },
  {
    title: 'Grip',
    subtitle: '2F-85 · 2F-140 · Hand-E',
    description:
      'Pick, place, and handle any part with adaptive grippers designed for collaborative robots.',
    images: [
      { src: '/img/2F-85_Gripper_White_Background.png', alt: '2F-85 Gripper' },
      { src: '/img/2F-140_Gripper_White_Background.png', alt: '2F-140 Gripper' },
      { src: '/img/Hand-E-Transparent.png', alt: 'Hand-E Gripper' },
    ],
    variant: 'product',
  },
  {
    title: 'Integrate',
    subtitle: 'C++ · Python · ROS2',
    description:
      'Connect Robotiq hardware to any robot controller using the SDK, Python library, or ROS2 packages.',
    images: [
      { src: '/img/C++-Logo.wine.png', alt: 'C++' },
      { src: '/img/python-logo-master-v3-TM-flattened.png', alt: 'Python' },
      { src: '/img/ros2.webp', alt: 'ROS2' },
    ],
    variant: 'logo',
  },
];

function Feature({ title, subtitle, description, images, variant }) {
  return (
    <div className={clsx('col col--4')}>
      <div className={styles.featureCard}>
        <div
          className={styles.imageArea}
          style={{ gridTemplateColumns: `repeat(${images.length}, 1fr)` }}
        >
          {images.map((img, i) => (
            <img
              key={i}
              src={img.src}
              alt={img.alt}
              className={variant === 'logo' ? styles.logoImg : styles.productImg}
            />
          ))}
        </div>
        <div className={styles.cardBody}>
          <Heading as="h3" className={styles.cardTitle}>{title}</Heading>
          <p className={styles.cardSubtitle}>{subtitle}</p>
          <p className={styles.cardDesc}>{description}</p>
        </div>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
