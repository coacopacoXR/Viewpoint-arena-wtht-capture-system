import React, { useRef, useEffect } from 'react';
import { Group, Vector3 } from 'three';
import { useStore } from '../../store';
import { ViewMode } from '../../types';

// Wrapper component that connects 3D objects to the Scene Tree State
const ModelPart: React.FC<{
    id: string;
    children: React.ReactNode | ((props: { selected: boolean }) => React.ReactNode);
    groupProps?: any;
}> = ({ id, children, groupProps }) => {
    const objectState = useStore(state => state.objectStates[id]);

    const visible = objectState ? objectState.visible : true;
    const selected = objectState ? objectState.selected : false;

    if (!visible) return null;

    return (
        <group {...groupProps} userData={{ modelId: id }}>
            {typeof children === 'function' ? children({ selected }) : children}
        </group>
    );
};

// Reusable components for bicycle parts
const Tube: React.FC<{
    start: [number, number, number];
    end: [number, number, number];
    radius?: number;
    color?: string;
    selected?: boolean;
}> = ({ start, end, radius = 0.025, color = '#333', selected }) => {
    const startVec = new Vector3(...start);
    const endVec = new Vector3(...end);
    const mid = new Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
    const length = startVec.distanceTo(endVec);

    const ref = useRef<Group>(null);

    useEffect(() => {
        if (ref.current) {
            ref.current.lookAt(endVec);
            ref.current.rotateX(Math.PI / 2);
        }
    }, []);

    return (
        <group ref={ref} position={mid.toArray()}>
            <mesh castShadow receiveShadow>
                <cylinderGeometry args={[radius, radius, length, 16]} />
                <meshStandardMaterial
                    color={selected ? '#0088ff' : color}
                    metalness={0.6}
                    roughness={0.3}
                    emissive={selected ? '#0044aa' : '#000000'}
                    emissiveIntensity={selected ? 0.5 : 0}
                />
            </mesh>
        </group>
    );
};

const Wheel: React.FC<{
    position: [number, number, number];
    selected?: boolean;
    id: string;
    label: string;
}> = ({ position, selected, id, label }) => {
    const { registerPOI } = useStore();
    const ref = useRef<Group>(null);

    useEffect(() => {
        if (ref.current) {
            const worldPos = new Vector3();
            ref.current.getWorldPosition(worldPos);
            registerPOI({ id, position: worldPos, label, type: 'GENERAL' });
        }
    }, [registerPOI, id, label]);

    return (
        <group ref={ref} position={position} rotation={[0, 0, Math.PI / 2]}>
            {/* Hub */}
            <mesh castShadow receiveShadow>
                <cylinderGeometry args={[0.04, 0.04, 0.08, 16]} />
                <meshStandardMaterial
                    color={selected ? '#0088ff' : '#666'}
                    metalness={0.8}
                    roughness={0.2}
                />
            </mesh>
            {/* Rim */}
            <mesh castShadow receiveShadow>
                <torusGeometry args={[0.35, 0.02, 8, 32]} />
                <meshStandardMaterial
                    color={selected ? '#0088ff' : '#888'}
                    metalness={0.9}
                    roughness={0.1}
                    emissive={selected ? '#0044aa' : '#000000'}
                    emissiveIntensity={selected ? 0.5 : 0}
                />
            </mesh>
            {/* Tire */}
            <mesh castShadow receiveShadow>
                <torusGeometry args={[0.35, 0.04, 16, 32]} />
                <meshStandardMaterial
                    color={selected ? '#005588' : '#1a1a1a'}
                    roughness={0.9}
                />
            </mesh>
            {/* Spokes (simplified) */}
            {Array.from({ length: 16 }).map((_, i) => {
                const angle = (i / 16) * Math.PI * 2;
                return (
                    <mesh key={i} position={[0, Math.cos(angle) * 0.175, Math.sin(angle) * 0.175]}>
                        <cylinderGeometry args={[0.002, 0.002, 0.32, 4]} />
                        <meshStandardMaterial color="#ccc" metalness={0.9} />
                    </mesh>
                );
            })}
            {/* Brake rotor */}
            <mesh position={[0.05, 0, 0]}>
                <cylinderGeometry args={[0.08, 0.08, 0.003, 24]} />
                <meshStandardMaterial color="#999" metalness={0.95} roughness={0.1} />
            </mesh>
        </group>
    );
};

const Bicycle: React.FC = () => {
    const groupRef = useRef<Group>(null);
    const { registerPOI, viewMode } = useStore();

    const isHeatmap = viewMode === ViewMode.HEATMAP;
    const frameColor = isHeatmap ? '#ff3333' : '#2563eb'; // Blue frame

    // Register key POIs
    useEffect(() => {
        if (groupRef.current) {
            registerPOI({ id: 'frame-poi', position: new Vector3(0, 0.5, 0), label: 'Main Frame', type: 'GENERAL' });
            registerPOI({ id: 'handlebar-poi', position: new Vector3(0.5, 0.9, 0), label: 'Handlebar', type: 'GENERAL' });
            registerPOI({ id: 'saddle-poi', position: new Vector3(-0.4, 0.85, 0), label: 'Saddle', type: 'GENERAL' });
            registerPOI({ id: 'crankset-poi', position: new Vector3(0, 0.25, 0), label: 'Crankset', type: 'GENERAL' });
            registerPOI({ id: 'derailleur-poi', position: new Vector3(-0.6, 0.2, 0), label: 'Rear Derailleur', type: 'GENERAL' });
        }
    }, [registerPOI]);

    return (
        <group ref={groupRef} position={[0, 0, 0]} scale={1.5}>
            <ModelPart id="bicycle_assembly">

                {/* FRAME ASSEMBLY */}
                <ModelPart id="frame_grp">
                    {/* Main triangle */}
                    <ModelPart id="main_frame">
                        {({ selected }) => (
                            <group>
                                {/* Top tube */}
                                <Tube start={[0.45, 0.55, 0]} end={[-0.3, 0.55, 0]} radius={0.022} color={frameColor} selected={selected} />
                            </group>
                        )}
                    </ModelPart>
                    <ModelPart id="top_tube">
                        {({ selected }) => (
                            <Tube start={[0.45, 0.55, 0]} end={[-0.3, 0.55, 0]} radius={0.022} color={frameColor} selected={selected} />
                        )}
                    </ModelPart>
                    <ModelPart id="down_tube">
                        {({ selected }) => (
                            <Tube start={[0.45, 0.45, 0]} end={[0, 0.18, 0]} radius={0.028} color={frameColor} selected={selected} />
                        )}
                    </ModelPart>
                    <ModelPart id="seat_tube">
                        {({ selected }) => (
                            <Tube start={[-0.3, 0.55, 0]} end={[0, 0.18, 0]} radius={0.024} color={frameColor} selected={selected} />
                        )}
                    </ModelPart>
                    <ModelPart id="chain_stays">
                        {({ selected }) => (
                            <group>
                                <Tube start={[0, 0.18, 0.05]} end={[-0.6, 0.35, 0.05]} radius={0.015} color={frameColor} selected={selected} />
                                <Tube start={[0, 0.18, -0.05]} end={[-0.6, 0.35, -0.05]} radius={0.015} color={frameColor} selected={selected} />
                            </group>
                        )}
                    </ModelPart>
                    <ModelPart id="seat_stays">
                        {({ selected }) => (
                            <group>
                                <Tube start={[-0.3, 0.55, 0.03]} end={[-0.6, 0.35, 0.05]} radius={0.012} color={frameColor} selected={selected} />
                                <Tube start={[-0.3, 0.55, -0.03]} end={[-0.6, 0.35, -0.05]} radius={0.012} color={frameColor} selected={selected} />
                            </group>
                        )}
                    </ModelPart>
                    <ModelPart id="head_tube">
                        {({ selected }) => (
                            <mesh position={[0.45, 0.5, 0]} castShadow>
                                <cylinderGeometry args={[0.025, 0.025, 0.12, 16]} />
                                <meshStandardMaterial
                                    color={selected ? '#0088ff' : frameColor}
                                    metalness={0.6}
                                    roughness={0.3}
                                />
                            </mesh>
                        )}
                    </ModelPart>
                    <ModelPart id="bottom_bracket">
                        {({ selected }) => (
                            <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                                <cylinderGeometry args={[0.035, 0.035, 0.08, 16]} />
                                <meshStandardMaterial
                                    color={selected ? '#0088ff' : '#333'}
                                    metalness={0.7}
                                    roughness={0.3}
                                />
                            </mesh>
                        )}
                    </ModelPart>
                </ModelPart>

                {/* FRONT ASSEMBLY */}
                <ModelPart id="front_assembly">
                    <ModelPart id="fork_grp">
                        <ModelPart id="fork_crown">
                            {({ selected }) => (
                                <mesh position={[0.45, 0.42, 0]} castShadow>
                                    <boxGeometry args={[0.03, 0.04, 0.08]} />
                                    <meshStandardMaterial color={selected ? '#0088ff' : '#333'} metalness={0.7} />
                                </mesh>
                            )}
                        </ModelPart>
                        <ModelPart id="fork_blades">
                            {({ selected }) => (
                                <group>
                                    <Tube start={[0.45, 0.42, 0.04]} end={[0.6, 0.35, 0.04]} radius={0.015} color={selected ? '#0088ff' : '#333'} selected={selected} />
                                    <Tube start={[0.45, 0.42, -0.04]} end={[0.6, 0.35, -0.04]} radius={0.015} color={selected ? '#0088ff' : '#333'} selected={selected} />
                                </group>
                            )}
                        </ModelPart>
                        <ModelPart id="fork_dropouts">
                            {({ selected }) => (
                                <group>
                                    <mesh position={[0.6, 0.35, 0.04]} castShadow>
                                        <boxGeometry args={[0.02, 0.04, 0.02]} />
                                        <meshStandardMaterial color={selected ? '#0088ff' : '#555'} metalness={0.8} />
                                    </mesh>
                                    <mesh position={[0.6, 0.35, -0.04]} castShadow>
                                        <boxGeometry args={[0.02, 0.04, 0.02]} />
                                        <meshStandardMaterial color={selected ? '#0088ff' : '#555'} metalness={0.8} />
                                    </mesh>
                                </group>
                            )}
                        </ModelPart>
                    </ModelPart>
                    <ModelPart id="headset">
                        {({ selected }) => (
                            <mesh position={[0.45, 0.57, 0]} castShadow>
                                <cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
                                <meshStandardMaterial color={selected ? '#0088ff' : '#444'} metalness={0.8} />
                            </mesh>
                        )}
                    </ModelPart>
                    <ModelPart id="stem">
                        {({ selected }) => (
                            <Tube start={[0.45, 0.6, 0]} end={[0.5, 0.7, 0]} radius={0.018} color={selected ? '#0088ff' : '#333'} selected={selected} />
                        )}
                    </ModelPart>
                    <ModelPart id="handlebar">
                        {({ selected }) => (
                            <group position={[0.5, 0.72, 0]}>
                                <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                                    <torusGeometry args={[0.2, 0.012, 8, 32, Math.PI]} />
                                    <meshStandardMaterial
                                        color={selected ? '#0088ff' : '#333'}
                                        metalness={0.7}
                                        roughness={0.3}
                                        emissive={selected ? '#0044aa' : '#000000'}
                                        emissiveIntensity={selected ? 0.5 : 0}
                                    />
                                </mesh>
                            </group>
                        )}
                    </ModelPart>
                    <ModelPart id="grips">
                        {({ selected }) => (
                            <group>
                                <mesh position={[0.5, 0.72, 0.18]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                                    <cylinderGeometry args={[0.018, 0.018, 0.1, 12]} />
                                    <meshStandardMaterial color={selected ? '#0088ff' : '#1a1a1a'} roughness={0.9} />
                                </mesh>
                                <mesh position={[0.5, 0.72, -0.18]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                                    <cylinderGeometry args={[0.018, 0.018, 0.1, 12]} />
                                    <meshStandardMaterial color={selected ? '#0088ff' : '#1a1a1a'} roughness={0.9} />
                                </mesh>
                            </group>
                        )}
                    </ModelPart>
                    <ModelPart id="front_brake_lever">
                        {({ selected }) => (
                            <mesh position={[0.5, 0.72, 0.15]} rotation={[0.5, 0, 0]} castShadow>
                                <boxGeometry args={[0.08, 0.015, 0.02]} />
                                <meshStandardMaterial color={selected ? '#0088ff' : '#222'} metalness={0.6} />
                            </mesh>
                        )}
                    </ModelPart>
                </ModelPart>

                {/* FRONT WHEEL */}
                <ModelPart id="wheel_front">
                    {({ selected }) => (
                        <group>
                            <ModelPart id="hub_front">
                                {({ selected: s }) => <Wheel position={[0.6, 0.35, 0]} selected={s || selected} id="wheel-front-poi" label="Front Wheel" />}
                            </ModelPart>
                        </group>
                    )}
                </ModelPart>

                {/* REAR WHEEL */}
                <ModelPart id="wheel_rear">
                    {({ selected }) => (
                        <group>
                            <ModelPart id="hub_rear">
                                {({ selected: s }) => <Wheel position={[-0.6, 0.35, 0]} selected={s || selected} id="wheel-rear-poi" label="Rear Wheel" />}
                            </ModelPart>
                            <ModelPart id="cassette">
                                {({ selected: s }) => (
                                    <mesh position={[-0.6, 0.35, 0.06]} rotation={[0, 0, Math.PI / 2]} castShadow>
                                        <cylinderGeometry args={[0.06, 0.04, 0.03, 16]} />
                                        <meshStandardMaterial color={s ? '#0088ff' : '#888'} metalness={0.9} roughness={0.1} />
                                    </mesh>
                                )}
                            </ModelPart>
                        </group>
                    )}
                </ModelPart>

                {/* DRIVETRAIN */}
                <ModelPart id="drivetrain">
                    <ModelPart id="crankset">
                        <ModelPart id="crank_arms">
                            {({ selected }) => (
                                <group>
                                    <Tube start={[0, 0.18, 0.06]} end={[0.12, 0.08, 0.06]} radius={0.012} color={selected ? '#0088ff' : '#333'} selected={selected} />
                                    <Tube start={[0, 0.18, -0.06]} end={[-0.12, 0.28, -0.06]} radius={0.012} color={selected ? '#0088ff' : '#333'} selected={selected} />
                                </group>
                            )}
                        </ModelPart>
                        <ModelPart id="chainring">
                            {({ selected }) => (
                                <mesh position={[0, 0.18, 0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                                    <torusGeometry args={[0.08, 0.008, 8, 32]} />
                                    <meshStandardMaterial
                                        color={selected ? '#0088ff' : '#555'}
                                        metalness={0.85}
                                        roughness={0.15}
                                    />
                                </mesh>
                            )}
                        </ModelPart>
                        <ModelPart id="pedals">
                            {({ selected }) => (
                                <group>
                                    <mesh position={[0.12, 0.08, 0.08]} castShadow>
                                        <boxGeometry args={[0.08, 0.015, 0.04]} />
                                        <meshStandardMaterial color={selected ? '#0088ff' : '#222'} roughness={0.8} />
                                    </mesh>
                                    <mesh position={[-0.12, 0.28, -0.08]} castShadow>
                                        <boxGeometry args={[0.08, 0.015, 0.04]} />
                                        <meshStandardMaterial color={selected ? '#0088ff' : '#222'} roughness={0.8} />
                                    </mesh>
                                </group>
                            )}
                        </ModelPart>
                    </ModelPart>
                    <ModelPart id="chain">
                        {({ selected }) => (
                            <mesh position={[-0.3, 0.26, 0.055]} castShadow>
                                <torusGeometry args={[0.3, 0.006, 6, 48, Math.PI]} />
                                <meshStandardMaterial color={selected ? '#0088ff' : '#444'} metalness={0.7} roughness={0.4} />
                            </mesh>
                        )}
                    </ModelPart>
                    <ModelPart id="derailleur_rear">
                        {({ selected }) => (
                            <group position={[-0.55, 0.28, 0.06]}>
                                <mesh castShadow>
                                    <boxGeometry args={[0.04, 0.08, 0.03]} />
                                    <meshStandardMaterial color={selected ? '#0088ff' : '#333'} metalness={0.6} />
                                </mesh>
                                <mesh position={[0, -0.06, 0]} castShadow>
                                    <cylinderGeometry args={[0.015, 0.015, 0.02, 12]} />
                                    <meshStandardMaterial color={selected ? '#0088ff' : '#555'} metalness={0.8} />
                                </mesh>
                            </group>
                        )}
                    </ModelPart>
                </ModelPart>

                {/* BRAKING SYSTEM */}
                <ModelPart id="braking_system">
                    <ModelPart id="brake_front">
                        <ModelPart id="caliper_front">
                            {({ selected }) => (
                                <mesh position={[0.55, 0.35, 0.08]} castShadow>
                                    <boxGeometry args={[0.04, 0.06, 0.025]} />
                                    <meshStandardMaterial color={selected ? '#0088ff' : '#333'} metalness={0.7} />
                                </mesh>
                            )}
                        </ModelPart>
                        <ModelPart id="rotor_front">
                            {({ selected }) => null /* Rendered as part of wheel */}
                        </ModelPart>
                    </ModelPart>
                    <ModelPart id="brake_rear">
                        <ModelPart id="caliper_rear">
                            {({ selected }) => (
                                <mesh position={[-0.55, 0.35, 0.08]} castShadow>
                                    <boxGeometry args={[0.04, 0.06, 0.025]} />
                                    <meshStandardMaterial color={selected ? '#0088ff' : '#333'} metalness={0.7} />
                                </mesh>
                            )}
                        </ModelPart>
                        <ModelPart id="rotor_rear">
                            {({ selected }) => null /* Rendered as part of wheel */}
                        </ModelPart>
                    </ModelPart>
                    <ModelPart id="brake_cables">
                        {({ selected }) => (
                            <group>
                                {/* Simplified brake lines */}
                                <Tube start={[0.5, 0.72, 0.14]} end={[0.55, 0.35, 0.08]} radius={0.004} color={selected ? '#0088ff' : '#111'} selected={selected} />
                            </group>
                        )}
                    </ModelPart>
                </ModelPart>

                {/* COCKPIT */}
                <ModelPart id="cockpit">
                    <ModelPart id="saddle">
                        {({ selected }) => (
                            <group position={[-0.35, 0.78, 0]}>
                                <mesh castShadow>
                                    <boxGeometry args={[0.25, 0.04, 0.12]} />
                                    <meshStandardMaterial
                                        color={selected ? '#0088ff' : '#1a1a1a'}
                                        roughness={0.9}
                                        emissive={selected ? '#0044aa' : '#000000'}
                                        emissiveIntensity={selected ? 0.5 : 0}
                                    />
                                </mesh>
                                {/* Saddle rails */}
                                <mesh position={[0, -0.03, 0.03]}>
                                    <cylinderGeometry args={[0.004, 0.004, 0.15, 6]} />
                                    <meshStandardMaterial color="#888" metalness={0.9} />
                                </mesh>
                                <mesh position={[0, -0.03, -0.03]}>
                                    <cylinderGeometry args={[0.004, 0.004, 0.15, 6]} />
                                    <meshStandardMaterial color="#888" metalness={0.9} />
                                </mesh>
                            </group>
                        )}
                    </ModelPart>
                    <ModelPart id="seatpost">
                        {({ selected }) => (
                            <Tube start={[-0.32, 0.55, 0]} end={[-0.35, 0.73, 0]} radius={0.015} color={selected ? '#0088ff' : '#333'} selected={selected} />
                        )}
                    </ModelPart>
                    <ModelPart id="seatpost_clamp">
                        {({ selected }) => (
                            <mesh position={[-0.31, 0.56, 0]} castShadow>
                                <cylinderGeometry args={[0.022, 0.022, 0.025, 16]} />
                                <meshStandardMaterial color={selected ? '#0088ff' : '#444'} metalness={0.7} />
                            </mesh>
                        )}
                    </ModelPart>
                </ModelPart>

                {/* ACCESSORIES */}
                <ModelPart id="accessories">
                    <ModelPart id="bell">
                        {({ selected }) => (
                            <group position={[0.48, 0.74, 0.12]}>
                                <mesh castShadow>
                                    <sphereGeometry args={[0.025, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
                                    <meshStandardMaterial color={selected ? '#0088ff' : '#c0c0c0'} metalness={0.9} roughness={0.1} />
                                </mesh>
                            </group>
                        )}
                    </ModelPart>
                    <ModelPart id="reflectors">
                        {({ selected }) => (
                            <group>
                                {/* Front reflector */}
                                <mesh position={[0.6, 0.35, 0.08]}>
                                    <boxGeometry args={[0.02, 0.03, 0.005]} />
                                    <meshStandardMaterial color={selected ? '#0088ff' : '#fff'} emissive="#ff0000" emissiveIntensity={0.2} />
                                </mesh>
                                {/* Rear reflector */}
                                <mesh position={[-0.65, 0.38, 0]}>
                                    <boxGeometry args={[0.005, 0.04, 0.05]} />
                                    <meshStandardMaterial color={selected ? '#0088ff' : '#ff0000'} emissive="#ff0000" emissiveIntensity={0.3} />
                                </mesh>
                            </group>
                        )}
                    </ModelPart>
                    <ModelPart id="kickstand">
                        {({ selected }) => (
                            <group position={[-0.1, 0.15, -0.08]}>
                                <mesh rotation={[0, 0, -0.3]} position={[0, -0.1, 0]} castShadow>
                                    <cylinderGeometry args={[0.008, 0.008, 0.25, 8]} />
                                    <meshStandardMaterial color={selected ? '#0088ff' : '#333'} metalness={0.7} />
                                </mesh>
                            </group>
                        )}
                    </ModelPart>
                </ModelPart>

            </ModelPart>
        </group>
    );
};

export default Bicycle;
