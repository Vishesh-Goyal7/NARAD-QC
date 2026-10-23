"""One-time export of fitted notebook models; loading never retrains or fabricates them."""
import hashlib
import json
import platform
from pathlib import Path

MODEL_NAMES = (
    'PHASE4_FINAL_RELIABILITY_MODEL', 'PHASE4_FINAL_RELIABILITY_CALIBRATOR',
    'PHASE4_FINAL_LATENCY_MODEL', 'PHASE4_FINAL_VISIBILITY_MODEL',
)
FEATURES = ['elementary_distance_km', 'repeater_count', 'multiplexed_cycle_success_probability']


def export_calibration(namespace, destination):
    """Call from an initialized notebook with globals(); exports only fitted service models."""
    import joblib
    import sklearn
    from sklearn.utils.validation import check_is_fitted
    missing = [key for key in MODEL_NAMES if key not in namespace]
    if missing:
        raise RuntimeError('Initialize the final Policy C models first: ' + ', '.join(missing))
    for key in MODEL_NAMES:
        check_is_fitted(namespace[key])
    bounds = namespace.get('PHASE4_POLICY_C_CALIBRATION_BOUNDS')
    if bounds is None and 'PHASE4_CAL_IMPROVED_SUMMARY_DF' in namespace:
        df = namespace['PHASE4_CAL_IMPROVED_SUMMARY_DF']
        bounds = {f: [float(df[f].min()), float(df[f].max())] for f in FEATURES}
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({key: namespace[key] for key in MODEL_NAMES}, path)
    meta = {'schema_version': 1, 'features': FEATURES, 'python': platform.python_version(),
            'scikit_learn': sklearn.__version__, 'joblib': joblib.__version__,
            'calibration_bounds': bounds, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    path.with_suffix('.json').write_text(json.dumps(meta, indent=2) + '\n')
    return meta


def load_calibration(namespace, source):
    import joblib
    import sklearn
    import numpy as np
    from sklearn.utils.validation import check_is_fitted
    path = Path(source)
    if not path.is_file():
        raise RuntimeError(f'Missing fitted Policy C artifact: {path}. Run the Colab export in backend/README.md; no synthetic models are substituted.')
    meta = json.loads(path.with_suffix('.json').read_text())
    if meta.get('schema_version') != 1 or meta.get('features') != FEATURES:
        raise RuntimeError('Calibration artifact schema/feature order does not match this backend.')
    if hashlib.sha256(path.read_bytes()).hexdigest() != meta['sha256']:
        raise RuntimeError('Calibration artifact checksum mismatch.')
    if meta['scikit_learn'] != sklearn.__version__:
        raise RuntimeError(f"Use scikit-learn=={meta['scikit_learn']} (artifact version), currently {sklearn.__version__}.")
    # joblib is pickle-based: load only the maintainer's trusted local export.
    models = joblib.load(path)
    for key in MODEL_NAMES:
        check_is_fitted(models[key])
    vector = np.array([[50., 2., .5]])
    score = float(models[MODEL_NAMES[0]].decision_function(vector)[0])
    probability = float(models[MODEL_NAMES[1]].predict_proba([[score]])[0, 1])
    predictions = [float(models[k].predict(vector)[0]) for k in MODEL_NAMES[2:]]
    if not np.isfinite([score, probability, *predictions]).all() or not 0 <= probability <= 1:
        raise RuntimeError('Calibration model sanity prediction failed.')
    namespace.update({key: models[key] for key in MODEL_NAMES})
    namespace['PHASE4_POLICY_C_CALIBRATION_BOUNDS'] = meta.get('calibration_bounds')
    return meta
