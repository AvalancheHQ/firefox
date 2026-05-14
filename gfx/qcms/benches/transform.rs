use codspeed_criterion_compat::{black_box, criterion_group, criterion_main, Criterion};
use qcms::{CIE_xyY, CIE_xyYTRIPLE, DataType, Intent, Profile, Transform};

fn create_output_profile(precache: bool) -> Box<Profile> {
    let rec709_primaries = CIE_xyYTRIPLE {
        red: CIE_xyY { x: 0.6400, y: 0.3300, Y: 1.0 },
        green: CIE_xyY { x: 0.3000, y: 0.6000, Y: 1.0 },
        blue: CIE_xyY { x: 0.1500, y: 0.0600, Y: 1.0 },
    };
    let d65 = CIE_xyY { x: 0.3127, y: 0.3290, Y: 1.0 };
    let mut output = Profile::new_rgb_with_gamma_set(d65, rec709_primaries, 2.2, 2.2, 2.2)
        .expect("failed to create output profile");
    if precache {
        output.precache_output_transform();
    }
    output
}

fn create_pixel_data(num_pixels: usize) -> Vec<u8> {
    let mut data = Vec::with_capacity(num_pixels * 3);
    for i in 0..num_pixels {
        data.push(((i * 7) % 256) as u8);
        data.push(((i * 13 + 50) % 256) as u8);
        data.push(((i * 23 + 100) % 256) as u8);
    }
    data
}

fn bench_transform_rgb_no_precache(c: &mut Criterion) {
    let srgb = Profile::new_sRGB();
    let output = create_output_profile(false);
    let transform = Transform::new(&srgb, &output, DataType::RGB8, Intent::Perceptual)
        .expect("failed to create transform");
    let data = create_pixel_data(1000);

    c.bench_function("transform_rgb_no_precache_1000px", |b| {
        b.iter(|| {
            let mut d = data.clone();
            transform.apply(black_box(&mut d));
            black_box(&d);
        })
    });
}

fn bench_transform_rgb_precache(c: &mut Criterion) {
    let srgb = Profile::new_sRGB();
    let output = create_output_profile(true);
    let transform = Transform::new(&srgb, &output, DataType::RGB8, Intent::Perceptual)
        .expect("failed to create transform");
    let data = create_pixel_data(1000);

    c.bench_function("transform_rgb_precache_1000px", |b| {
        b.iter(|| {
            let mut d = data.clone();
            transform.apply(black_box(&mut d));
            black_box(&d);
        })
    });
}

fn bench_transform_creation(c: &mut Criterion) {
    let srgb = Profile::new_sRGB();
    let output = create_output_profile(false);

    c.bench_function("transform_creation_no_precache", |b| {
        b.iter(|| {
            let t = Transform::new(
                black_box(&srgb),
                black_box(&output),
                DataType::RGB8,
                Intent::Perceptual,
            );
            black_box(&t);
        })
    });
}

criterion_group!(
    benches,
    bench_transform_rgb_no_precache,
    bench_transform_rgb_precache,
    bench_transform_creation,
);
criterion_main!(benches);
