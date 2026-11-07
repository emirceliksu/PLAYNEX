use std::collections::BTreeSet;

use crate::document::{
    Behavior, BodyKind, Dimension, Entity, GameDocument, HudKind, Literal, SCHEMA_VERSION, Shape,
    Vec3,
};
use crate::error::{DocumentError, ErrorCode};
use crate::limits::*;

/// Structural checks that do not need name resolution. Reference checks
/// (variables, functions, prefabs, sounds) happen while compiling.
pub fn check_structure(doc: &GameDocument, errors: &mut Vec<DocumentError>) {
    if doc.schema_version != SCHEMA_VERSION {
        errors.push(DocumentError::new(
            ErrorCode::UnsupportedVersion,
            "schemaVersion",
        ));
        return;
    }

    let world = &doc.world;
    if !world.size.is_finite()
        || [world.size.x, world.size.y]
            .iter()
            .any(|v| *v < 1.0 || *v > MAX_WORLD_SIZE)
        || (doc.dimension == Dimension::Spatial
            && (world.size.z < 1.0 || world.size.z > MAX_WORLD_SIZE))
    {
        errors.push(DocumentError::new(ErrorCode::OutOfRange, "world.size"));
    }
    if !world.gravity.is_finite() || world.gravity.abs() > 200.0 {
        errors.push(DocumentError::new(ErrorCode::OutOfRange, "world.gravity"));
    }
    if world.background >= PALETTE_SIZE {
        errors.push(DocumentError::new(
            ErrorCode::InvalidColor,
            "world.background",
        ));
    }
    if world
        .time_limit_seconds
        .is_some_and(|s| s == 0 || s > MAX_TICKS / TICKS_PER_SECOND)
    {
        errors.push(DocumentError::new(
            ErrorCode::OutOfRange,
            "world.timeLimitSeconds",
        ));
    }
    if world.lives.is_some_and(|l| l == 0 || l > 99) {
        errors.push(DocumentError::new(ErrorCode::OutOfRange, "world.lives"));
    }

    limit(errors, doc.entities.len(), MAX_ENTITIES, "entities");
    limit(errors, doc.prefabs.len(), MAX_PREFABS, "prefabs");
    limit(errors, doc.variables.len(), MAX_VARIABLES, "variables");
    limit(errors, doc.lists.len(), MAX_LISTS, "lists");
    limit(errors, doc.functions.len(), MAX_FUNCTIONS, "functions");
    limit(errors, doc.sounds.len(), MAX_SOUNDS, "sounds");
    limit(errors, doc.hud.len(), MAX_HUD_ITEMS, "hud");

    let mut ids = BTreeSet::new();
    for (index, entity) in doc.entities.iter().enumerate() {
        let path = format!("entities[{index}]");
        if !ids.insert(entity.id) {
            errors.push(DocumentError::new(
                ErrorCode::DuplicateId,
                format!("{path}.id"),
            ));
        }
        check_entity(doc.dimension, entity, &path, errors);
    }

    let mut prefab_names = BTreeSet::new();
    for (index, prefab) in doc.prefabs.iter().enumerate() {
        let path = format!("prefabs[{index}]");
        if !prefab_names.insert(prefab.name.as_str()) {
            errors.push(DocumentError::new(
                ErrorCode::DuplicateName,
                format!("{path}.name"),
            ));
        }
        check_entity(doc.dimension, prefab, &path, errors);
    }

    unique_names(
        errors,
        doc.variables.iter().map(|v| v.name.as_str()),
        "variables",
    );
    unique_names(errors, doc.lists.iter().map(|l| l.name.as_str()), "lists");
    unique_names(
        errors,
        doc.functions.iter().map(|f| f.name.as_str()),
        "functions",
    );
    unique_names(errors, doc.sounds.iter().map(|s| s.name.as_str()), "sounds");

    for (index, variable) in doc.variables.iter().enumerate() {
        check_literal(
            &variable.initial,
            &format!("variables[{index}].initial"),
            errors,
        );
    }
    for (index, list) in doc.lists.iter().enumerate() {
        limit(
            errors,
            list.initial.len(),
            MAX_LIST_ITEMS,
            &format!("lists[{index}].initial"),
        );
        for (item, literal) in list.initial.iter().enumerate() {
            check_literal(literal, &format!("lists[{index}].initial[{item}]"), errors);
        }
    }
    for (index, function) in doc.functions.iter().enumerate() {
        limit(
            errors,
            function.params.len(),
            MAX_PARAMS,
            &format!("functions[{index}].params"),
        );
        unique_names(
            errors,
            function.params.iter().map(String::as_str),
            &format!("functions[{index}].params"),
        );
    }
    for (index, sound) in doc.sounds.iter().enumerate() {
        if !(0.25..=4.0).contains(&sound.pitch) {
            errors.push(DocumentError::new(
                ErrorCode::OutOfRange,
                format!("sounds[{index}].pitch"),
            ));
        }
        if !(0.0..=1.0).contains(&sound.volume) {
            errors.push(DocumentError::new(
                ErrorCode::OutOfRange,
                format!("sounds[{index}].volume"),
            ));
        }
    }
    for (index, item) in doc.hud.iter().enumerate() {
        if let Some(label) = &item.label {
            text(errors, label, &format!("hud[{index}].label"));
        }
        if let HudKind::Text { text: value } = &item.kind {
            text(errors, value, &format!("hud[{index}].kind.text"));
        }
    }
}

fn check_entity(
    dimension: Dimension,
    entity: &Entity,
    path: &str,
    errors: &mut Vec<DocumentError>,
) {
    name(errors, &entity.name, &format!("{path}.name"));
    if dimension == Dimension::Spatial && entity.shape.is_flat() && entity.shape != Shape::Text {
        errors.push(DocumentError::new(
            ErrorCode::ShapeNotInDimension,
            format!("{path}.shape"),
        ));
    }
    if dimension == Dimension::Flat && !entity.shape.is_flat() {
        errors.push(DocumentError::new(
            ErrorCode::ShapeNotInDimension,
            format!("{path}.shape"),
        ));
    }
    match &entity.shape {
        Shape::Polygon { points } => {
            if points.len() < 3
                || points.len() > MAX_POLYGON_POINTS
                || points
                    .iter()
                    .flatten()
                    .any(|v| !v.is_finite() || v.abs() > 1.0)
            {
                errors.push(DocumentError::new(
                    ErrorCode::InvalidPolygon,
                    format!("{path}.shape"),
                ));
            }
        }
        Shape::Star { points } if !(3..=12).contains(points) => {
            errors.push(DocumentError::new(
                ErrorCode::OutOfRange,
                format!("{path}.shape.points"),
            ));
        }
        _ => {}
    }
    if !coordinate(entity.position) {
        errors.push(DocumentError::new(
            ErrorCode::OutOfRange,
            format!("{path}.position"),
        ));
    }
    if !entity.rotation.is_finite() {
        errors.push(DocumentError::new(
            ErrorCode::InvalidNumber,
            format!("{path}.rotation"),
        ));
    }
    let size = entity.size;
    let flat = dimension == Dimension::Flat;
    if !size.is_finite()
        || [size.x, size.y]
            .iter()
            .any(|v| !(MIN_SIZE..=MAX_SIZE).contains(v))
        || (!flat && !(MIN_SIZE..=MAX_SIZE).contains(&size.z))
    {
        errors.push(DocumentError::new(
            ErrorCode::OutOfRange,
            format!("{path}.size"),
        ));
    }
    if entity.color >= PALETTE_SIZE {
        errors.push(DocumentError::new(
            ErrorCode::InvalidColor,
            format!("{path}.color"),
        ));
    }
    if !(0.0..=1.0).contains(&entity.bounce) {
        errors.push(DocumentError::new(
            ErrorCode::OutOfRange,
            format!("{path}.bounce"),
        ));
    }
    if !(0.0..=1.0).contains(&entity.friction) {
        errors.push(DocumentError::new(
            ErrorCode::OutOfRange,
            format!("{path}.friction"),
        ));
    }
    limit(errors, entity.tags.len(), MAX_TAGS, &format!("{path}.tags"));
    for (index, tag) in entity.tags.iter().enumerate() {
        name(errors, tag, &format!("{path}.tags[{index}]"));
    }
    if let Some(value) = &entity.text {
        text(errors, value, &format!("{path}.text"));
    }
    limit(
        errors,
        entity.variables.len(),
        MAX_VARIABLES,
        &format!("{path}.variables"),
    );
    unique_names(
        errors,
        entity.variables.iter().map(|v| v.name.as_str()),
        &format!("{path}.variables"),
    );
    for (index, variable) in entity.variables.iter().enumerate() {
        check_literal(
            &variable.initial,
            &format!("{path}.variables[{index}].initial"),
            errors,
        );
    }

    for (index, behavior) in entity.behaviors.iter().enumerate() {
        let behavior_path = format!("{path}.behaviors[{index}]");
        let moving = matches!(entity.body, BodyKind::Dynamic | BodyKind::Kinematic);
        let (numbers, needs_motion): (Vec<(f64, f64)>, bool) = match behavior {
            Behavior::PlatformerController { speed, jump } => (
                vec![(*speed, 100.0), (*jump, 100.0)],
                entity.body != BodyKind::Dynamic,
            ),
            Behavior::TopDownController { speed } => (vec![(*speed, 100.0)], !moving),
            Behavior::Patrol {
                distance, speed, ..
            } => (vec![(*distance, MAX_WORLD_SIZE), (*speed, 100.0)], !moving),
            Behavior::Chase { tag, speed } => {
                name(errors, tag, &format!("{behavior_path}.tag"));
                (vec![(*speed, 100.0)], !moving)
            }
            Behavior::Collectible { points } => (vec![(points.abs(), 1_000_000.0)], false),
            Behavior::Hazard { damage } => (vec![(f64::from(*damage), 99.0)], false),
            Behavior::Spin { degrees_per_second } => {
                (vec![(degrees_per_second.abs(), 3600.0)], false)
            }
            Behavior::Goal | Behavior::CameraTarget => (Vec::new(), false),
        };
        if numbers
            .iter()
            .any(|(value, max)| !value.is_finite() || *value < 0.0 || value > max)
        {
            errors.push(DocumentError::new(
                ErrorCode::OutOfRange,
                behavior_path.clone(),
            ));
        }
        if needs_motion {
            errors.push(DocumentError::new(
                ErrorCode::BehaviorNeedsMovingBody,
                behavior_path,
            ));
        }
    }
}

fn coordinate(v: Vec3) -> bool {
    v.is_finite()
        && v.x.abs() <= MAX_COORDINATE
        && v.y.abs() <= MAX_COORDINATE
        && v.z.abs() <= MAX_COORDINATE
}

fn check_literal(literal: &Literal, path: &str, errors: &mut Vec<DocumentError>) {
    match literal {
        Literal::Number(value) if !value.is_finite() => {
            errors.push(DocumentError::new(ErrorCode::InvalidNumber, path));
        }
        Literal::Text(value) => text(errors, value, path),
        _ => {}
    }
}

fn limit(errors: &mut Vec<DocumentError>, count: usize, max: usize, path: &str) {
    if count > max {
        errors.push(DocumentError::new(ErrorCode::TooMany, path).with_detail(max.to_string()));
    }
}

pub(crate) fn text(errors: &mut Vec<DocumentError>, value: &str, path: &str) {
    if value.chars().count() > MAX_TEXT_CHARS || value.chars().any(char::is_control) {
        errors.push(DocumentError::new(ErrorCode::TextTooLong, path));
    }
}

/// Names are user-facing labels; `#` is reserved for locals that behaviors generate.
pub(crate) fn valid_name(value: &str) -> bool {
    let count = value.chars().count();
    count > 0
        && count <= MAX_NAME_CHARS
        && !value.starts_with('#')
        && value.trim() == value
        && !value.chars().any(char::is_control)
}

fn name(errors: &mut Vec<DocumentError>, value: &str, path: &str) {
    if !valid_name(value) {
        errors.push(DocumentError::new(ErrorCode::InvalidName, path));
    }
}

fn unique_names<'a>(
    errors: &mut Vec<DocumentError>,
    names: impl Iterator<Item = &'a str>,
    path: &str,
) {
    let mut seen = BTreeSet::new();
    for (index, value) in names.enumerate() {
        name(errors, value, &format!("{path}[{index}]"));
        if !seen.insert(value) {
            errors.push(DocumentError::new(
                ErrorCode::DuplicateName,
                format!("{path}[{index}]"),
            ));
        }
    }
}
