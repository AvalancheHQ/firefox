use criterion::{black_box, criterion_group, criterion_main, Criterion};
use cssparser::color::parse_hash_color;

const ITERS: usize = 2000;

fn bench_case(c: &mut Criterion, name: &str, inputs: &[&[u8]]) {
    c.bench_function(name, |b| {
        b.iter(|| {
            let mut acc: u32 = 0;
            for _ in 0..ITERS {
                for &input in inputs {
                    if let Ok((r, g, b, a)) = parse_hash_color(black_box(input)) {
                        acc = acc
                            .wrapping_add(r as u32)
                            .wrapping_add(g as u32)
                            .wrapping_add(b as u32)
                            .wrapping_add(a as u32);
                    }
                }
            }
            black_box(acc)
        })
    });
}

fn bench_parse_hash_color(c: &mut Criterion) {
    bench_case(
        c,
        "parse_hash_color_6digit",
        &[b"ff0000", b"336699", b"abcdef", b"ABCDEF", b"1a2B3c"],
    );
    bench_case(
        c,
        "parse_hash_color_3digit",
        &[b"f00", b"369", b"abc", b"ABC", b"1a2"],
    );
    bench_case(
        c,
        "parse_hash_color_8digit",
        &[b"ff000080", b"336699cc", b"abcdefff", b"ABCDEF00", b"1a2B3c4D"],
    );
    bench_case(
        c,
        "parse_hash_color_4digit",
        &[b"f008", b"369c", b"abcf", b"ABC0", b"1a2D"],
    );
    bench_case(
        c,
        "parse_hash_color_invalid",
        &[b"gg0000", b"xyz", b"12345", b"", b"1"],
    );
}

criterion_group!(benches, bench_parse_hash_color);
criterion_main!(benches);
